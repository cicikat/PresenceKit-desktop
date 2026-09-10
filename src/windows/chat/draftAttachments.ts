import type { UploadAttachment } from '../../shared/api/backend';

export interface DraftAttachment extends UploadAttachment {
  id: string;
  filename: string;
  preview?: string;
}

export function attachmentKind(filename: string): 'image' | 'document' | null {
  if (/\.(png|jpe?g|gif|webp)$/i.test(filename)) return 'image';
  if (/\.(txt|md|docx)$/i.test(filename)) return 'document';
  return null;
}

export function mergeAttachments(current: DraftAttachment[], added: DraftAttachment[]): DraftAttachment[] {
  const next = [...current, ...added];
  if (next.some(item => !attachmentKind(item.filename))) throw new Error('chat.attachments.unsupported');
  if (next.length > 10) throw new Error('chat.attachments.countLimit');
  if (next.length > 1 && next.some(item => attachmentKind(item.filename) === 'document')) {
    throw new Error('chat.attachments.singleDocument');
  }
  return next;
}

export async function fileToDraft(file: File): Promise<DraftAttachment> {
  const kind = attachmentKind(file.name);
  if (!kind) throw new Error('chat.attachments.unsupported');
  if (file.size > (kind === 'image' ? 10 : 5) * 1024 * 1024) throw new Error('chat.attachments.sizeLimit');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('chat.attachments.readFailed'));
    reader.readAsDataURL(file);
  });
  return { id: crypto.randomUUID(), filename: file.name, dataB64: dataUrl.split(',')[1], preview: kind === 'image' ? dataUrl : undefined };
}
