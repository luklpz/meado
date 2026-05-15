export class CreateChannelDto {
  name: string;
  type: 'TEXT' | 'VOICE';
  position?: number;
}
