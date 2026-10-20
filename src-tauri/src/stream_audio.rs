//! Stream audio on Windows without Biscord (and, optionally, Discord) in it.
//!
//! The browser's "system audio" capture records everything the PC plays, so
//! the people in the call would hear their own voices coming back through the
//! stream. Instead we capture every *other* app separately with WASAPI process
//! loopback, mix them, and hand 20 ms PCM chunks to the webview, which
//! publishes them as the stream's audio track.
//!
//! Sharing a window sends only that app's audio, like Discord. Sharing the
//! whole screen sends every app except Biscord, Discord (optional) and audio
//! "re-routing" tools, which play everything back a second time (that copy
//! would echo the stream and carry the call's voices).

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::ipc::{Channel, InvokeResponseBody};
use wasapi::{
  initialize_mta, AudioClient, DeviceEnumerator, Direction, SampleType, SessionState, StreamMode,
  WaveFormat,
};

const RATE: usize = 48_000;
const CHANNELS: usize = 2;
/// samples (not frames) per 20 ms chunk
const CHUNK: usize = RATE / 50 * CHANNELS;
/// drop audio that piles up beyond this (a stalled app shouldn't add latency)
const MAX_QUEUE: usize = RATE / 5 * CHANNELS;

type Queue = Arc<Mutex<VecDeque<f32>>>;

struct Session {
  stop: Arc<AtomicBool>,
}

static RUNNING: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

/// Processes whose audio must stay out of the stream: Biscord's own process
/// tree (its WebView2 children play the call) and, if asked, Discord.
fn excluded(system: &System, pid: u32, own: u32, skip_discord: bool) -> bool {
  let mut current = Some(Pid::from_u32(pid));
  let mut depth = 0;
  while let Some(p) = current {
    if p.as_u32() == own {
      return true;
    }
    let Some(process) = system.process(p) else { break };
    let name = process.name().to_string_lossy().to_lowercase();
    if skip_discord && name.starts_with("discord") {
      return true;
    }
    current = process.parent();
    depth += 1;
    if depth > 32 {
      break;
    }
  }
  false
}

/// Apps that capture the PC's audio and play it back (virtual mixers, speaker
/// enhancers). Their session is a copy of everything, Biscord included.
const REROUTERS: &[&str] = &[
  "nvidia broadcast",
  "steelseries",
  "sonar",
  "voicemeeter",
  "vbaudio",
  "nahimic",
  "fxsound",
  "audiorelay",
  "soundswitch",
  "equalizer",
];

fn is_rerouter(system: &System, pid: u32) -> bool {
  system.process(Pid::from_u32(pid)).is_some_and(|p| {
    let name = p.name().to_string_lossy().to_lowercase();
    REROUTERS.iter().any(|r| name.contains(r))
  })
}

/// The process behind a top-level window with this title, climbed up to the
/// app's main process (browsers play audio from a child process).
fn window_app(system: &System, title: &str) -> Option<u32> {
  use windows::core::BOOL;
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
  };

  struct Search {
    title: String,
    exact: Option<u32>,
    partial: Option<u32>,
  }

  unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let search = unsafe { &mut *(lparam.0 as *mut Search) };
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
      return BOOL(1);
    }
    let mut buffer = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut buffer) } as usize;
    if len == 0 {
      return BOOL(1);
    }
    let text = String::from_utf16_lossy(&buffer[..len]);
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if text == search.title {
      search.exact = Some(pid);
      return BOOL(0);
    }
    if search.partial.is_none() && (text.contains(&search.title) || search.title.contains(&text)) {
      search.partial = Some(pid);
    }
    BOOL(1)
  }

  let mut search = Search { title: title.to_string(), exact: None, partial: None };
  unsafe {
    let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize));
  }
  let pid = search.exact.or(search.partial)?;
  let name = |pid: u32| {
    system.process(Pid::from_u32(pid)).map(|p| p.name().to_string_lossy().to_lowercase())
  };
  let mut root = pid;
  for ancestor in ancestors(system, pid) {
    if name(ancestor) == name(pid) {
      root = ancestor;
    } else {
      break;
    }
  }
  Some(root)
}

/// The parent chain of a process (not including itself).
fn ancestors(system: &System, pid: u32) -> Vec<u32> {
  let mut chain = Vec::new();
  let mut current = system.process(Pid::from_u32(pid)).and_then(|p| p.parent());
  while let Some(p) = current {
    if chain.len() > 32 || chain.contains(&p.as_u32()) {
      break;
    }
    chain.push(p.as_u32());
    current = system.process(p).and_then(|process| process.parent());
  }
  chain
}

/// The apps to capture. Each is captured with its whole process tree, so we
/// skip any app whose tree would contain Biscord or Discord (e.g. a launcher
/// or explorer.exe that started them) and any app already covered by a
/// captured ancestor (otherwise its audio would be mixed in twice).
fn apps_to_capture(system: &System, own: u32, skip_discord: bool) -> HashSet<u32> {
  let mut forbidden: HashSet<u32> = ancestors(system, own).into_iter().collect();
  if skip_discord {
    for (pid, process) in system.processes() {
      if process.name().to_string_lossy().to_lowercase().starts_with("discord") {
        forbidden.extend(ancestors(system, pid.as_u32()));
      }
    }
  }
  let allowed: HashSet<u32> = audio_processes()
    .into_iter()
    .filter(|pid| {
      !forbidden.contains(pid)
        && !excluded(system, *pid, own, skip_discord)
        && !is_rerouter(system, *pid)
    })
    .collect();
  allowed
    .iter()
    .copied()
    .filter(|pid| !ancestors(system, *pid).iter().any(|a| allowed.contains(a)))
    .collect()
}

/// Every process with an audio session on any output device.
fn audio_processes() -> HashSet<u32> {
  let mut pids = HashSet::new();
  let Ok(enumerator) = DeviceEnumerator::new() else { return pids };
  let Ok(devices) = enumerator.get_device_collection(&Direction::Render) else {
    return pids;
  };
  for device in &devices {
    let Ok(device) = device else { continue };
    let Ok(manager) = device.get_iaudiosessionmanager() else { continue };
    let Ok(sessions) = manager.get_audiosessionenumerator() else { continue };
    let count = sessions.get_count().unwrap_or(0);
    for i in 0..count {
      let Ok(session) = sessions.get_session(i) else { continue };
      if matches!(session.get_state(), Ok(SessionState::Expired)) {
        continue;
      }
      if let Ok(pid) = session.get_process_id() {
        if pid != 0 {
          pids.insert(pid);
        }
      }
    }
  }
  pids
}

/// Captures one process into its queue until stopped or the process goes away.
fn capture(pid: u32, queue: Queue, stop: Arc<AtomicBool>) -> Result<(), Box<dyn std::error::Error>> {
  let _ = initialize_mta();
  let format = WaveFormat::new(32, 32, &SampleType::Float, RATE, CHANNELS, None);
  // `true` = INCLUDE the target's process tree (`false` would capture
  // everything *except* it)
  let mut client = AudioClient::new_application_loopback_client(pid, true)?;
  client.initialize_client(
    &format,
    &Direction::Capture,
    &StreamMode::EventsShared { autoconvert: true, buffer_duration_hns: 0 },
  )?;
  let event = client.set_get_eventhandle()?;
  let capture = client.get_audiocaptureclient()?;
  client.start_stream()?;

  let mut bytes = VecDeque::new();
  while !stop.load(Ordering::Relaxed) {
    if event.wait_for_event(1000).is_err() {
      continue; // silence: process loopback only signals when audio flows
    }
    capture.read_from_device_to_deque(&mut bytes)?;
    let mut queue = queue.lock().unwrap();
    while bytes.len() >= 4 {
      let sample = [
        bytes.pop_front().unwrap(),
        bytes.pop_front().unwrap(),
        bytes.pop_front().unwrap(),
        bytes.pop_front().unwrap(),
      ];
      queue.push_back(f32::from_le_bytes(sample));
    }
    let overflow = queue.len().saturating_sub(MAX_QUEUE);
    queue.drain(..overflow);
  }
  let _ = client.stop_stream();
  Ok(())
}

#[tauri::command]
pub fn start_stream_audio(
  channel: Channel<InvokeResponseBody>,
  skip_discord: bool,
  window_title: Option<String>,
) {
  stop_stream_audio();
  let running = Arc::new(AtomicBool::new(true));
  *RUNNING.lock().unwrap() = Some(running.clone());

  thread::spawn(move || {
    let _ = initialize_mta();
    let own = std::process::id();
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    // sharing a window: only that app (never Biscord or Discord themselves)
    // (a title we can't match falls back to the whole-screen behavior)
    let window = window_title
      .filter(|title| !title.is_empty())
      .and_then(|title| window_app(&system, &title))
      .map(|pid| (!excluded(&system, pid, own, skip_discord)).then_some(pid));
    let mut sessions: HashMap<u32, (Session, Queue)> = HashMap::new();
    let mut next_scan = Instant::now();
    let mut next_chunk = Instant::now();

    while running.load(Ordering::Relaxed) {
      // pick up apps that start (or stop) playing sound
      if Instant::now() >= next_scan {
        next_scan = Instant::now() + Duration::from_secs(1);
        system.refresh_processes(ProcessesToUpdate::All, true);
        let wanted = match window {
          Some(app) => app.into_iter().collect(),
          None => apps_to_capture(&system, own, skip_discord),
        };
        sessions.retain(|pid, (session, _)| {
          let keep = wanted.contains(pid) && !session.stop.load(Ordering::Relaxed);
          if !keep {
            session.stop.store(true, Ordering::Relaxed);
          }
          keep
        });
        for pid in wanted {
          if sessions.contains_key(&pid) {
            continue;
          }
          let queue: Queue = Arc::new(Mutex::new(VecDeque::new()));
          let stop = Arc::new(AtomicBool::new(false));
          let (q, s) = (queue.clone(), stop.clone());
          thread::spawn(move || {
            if capture(pid, q, s.clone()).is_err() {
              s.store(true, Ordering::Relaxed);
            }
          });
          sessions.insert(pid, (Session { stop }, queue));
        }
      }

      // mix one 20 ms chunk from every app
      next_chunk += Duration::from_millis(20);
      let now = Instant::now();
      if next_chunk > now {
        thread::sleep(next_chunk - now);
      } else if now - next_chunk > Duration::from_millis(200) {
        next_chunk = now; // fell far behind (sleep/suspend): don't burst
      }
      let mut mix = vec![0f32; CHUNK];
      for (_, queue) in sessions.values() {
        let mut queue = queue.lock().unwrap();
        let take = queue.len().min(CHUNK);
        for (i, sample) in queue.drain(..take).enumerate() {
          mix[i] += sample;
        }
      }
      let mut bytes = Vec::with_capacity(CHUNK * 4);
      for sample in mix {
        bytes.extend_from_slice(&sample.clamp(-1.0, 1.0).to_le_bytes());
      }
      if channel.send(InvokeResponseBody::Raw(bytes)).is_err() {
        break;
      }
    }

    for (session, _) in sessions.values() {
      session.stop.store(true, Ordering::Relaxed);
    }
  });
}

#[tauri::command]
pub fn stop_stream_audio() {
  if let Some(running) = RUNNING.lock().unwrap().take() {
    running.store(false, Ordering::Relaxed);
  }
}

