export class CreateServerDto {
  name: string;
  slug: string;
  description?: string;
  serverType?: 'DISCORD' | 'SPATIAL';
  accessType?: 'PUBLIC' | 'PASSWORD' | 'WHITELIST';
  password?: string;
}
