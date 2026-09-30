export interface Principal {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  amr: string[];
  acr?: string;
}
