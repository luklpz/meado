export class CreateServerDto {
  name: string;
  slug: string;
  description?: string;
  accessType?: 'PUBLIC' | 'PASSWORD' | 'WHITELIST';
  password?: string;
}
