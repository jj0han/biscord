import type { MemberRole, Role, Server } from "@/lib/types"

// Same bit values as Discord (and as the SQL helpers).
export const Permission = {
  CreateInvite: 1,
  KickMembers: 2,
  BanMembers: 4,
  Administrator: 8,
  ManageChannels: 16,
  ManageServer: 32,
  AddReactions: 64,
  Stream: 512,
  ViewChannel: 1024,
  SendMessages: 2048,
  ManageMessages: 8192,
  EmbedLinks: 16384,
  AttachFiles: 32768,
  ReadMessageHistory: 65536,
  MentionEveryone: 131072,
  Connect: 1048576,
  Speak: 2097152,
  MuteMembers: 4194304,
  ChangeNickname: 67108864,
  ManageNicknames: 134217728,
  ManageRoles: 268435456,
} as const

export type PermissionName = keyof typeof Permission

export const PERMISSION_LABELS: Record<
  PermissionName,
  { label: string; description: string }
> = {
  Administrator: {
    label: "Administrador",
    description:
      "Membros com essa permissão têm todas as permissões e ignoram restrições.",
  },
  ManageServer: {
    label: "Gerenciar servidor",
    description: "Permite alterar o nome e o ícone do servidor.",
  },
  ManageRoles: {
    label: "Gerenciar cargos",
    description: "Permite criar, editar e atribuir cargos.",
  },
  ManageChannels: {
    label: "Gerenciar canais",
    description: "Permite criar, editar e excluir canais.",
  },
  KickMembers: {
    label: "Expulsar membros",
    description: "Permite remover membros do servidor.",
  },
  BanMembers: {
    label: "Banir membros",
    description: "Permite banir membros permanentemente.",
  },
  CreateInvite: {
    label: "Criar convite",
    description: "Permite convidar novas pessoas para o servidor.",
  },
  ChangeNickname: {
    label: "Alterar apelido",
    description: "Permite que o membro altere o próprio apelido.",
  },
  ManageNicknames: {
    label: "Gerenciar apelidos",
    description: "Permite alterar o apelido de outros membros.",
  },
  ViewChannel: {
    label: "Ver canais",
    description: "Permite ver os canais do servidor.",
  },
  SendMessages: {
    label: "Enviar mensagens",
    description: "Permite enviar mensagens nos canais de texto.",
  },
  EmbedLinks: {
    label: "Inserir links",
    description: "Links enviados mostram uma prévia (embed).",
  },
  AttachFiles: {
    label: "Anexar arquivos",
    description: "Permite enviar arquivos e imagens.",
  },
  AddReactions: {
    label: "Adicionar reações",
    description: "Permite reagir a mensagens.",
  },
  MentionEveryone: {
    label: "Mencionar @everyone e @here",
    description: "Permite notificar todos os membros.",
  },
  ManageMessages: {
    label: "Gerenciar mensagens",
    description: "Permite excluir e fixar mensagens de outros membros.",
  },
  ReadMessageHistory: {
    label: "Ver histórico de mensagens",
    description: "Permite ler mensagens antigas.",
  },
  Connect: {
    label: "Conectar",
    description: "Permite entrar nos canais de voz.",
  },
  Speak: { label: "Falar", description: "Permite falar nos canais de voz." },
  Stream: {
    label: "Vídeo",
    description: "Permite compartilhar câmera e tela.",
  },
  MuteMembers: {
    label: "Silenciar membros",
    description: "Permite silenciar outros membros na voz.",
  },
}

export function computePermissions(
  userId: string,
  server: Server,
  roles: Role[],
  memberRoles: MemberRole[]
) {
  if (server.owner_id === userId) {
    return Number.MAX_SAFE_INTEGER
  }

  const mine = new Set(
    memberRoles.filter((mr) => mr.user_id === userId).map((mr) => mr.role_id)
  )

  return roles
    .filter((role) => role.is_default || mine.has(role.id))
    .reduce((acc, role) => acc | role.permissions, 0)
}

export function hasPermission(permissions: number, permission: number) {
  // bitwise ops in JS are 32-bit; every bit we use fits below 2^31
  if ((permissions & Permission.Administrator) === Permission.Administrator) {
    return true
  }
  return (permissions & permission) === permission
}

export function roleColor(color: number) {
  return color ? `#${color.toString(16).padStart(6, "0")}` : undefined
}
