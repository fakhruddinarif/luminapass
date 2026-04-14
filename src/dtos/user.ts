export interface CreateUserParams {
  email: string;
  username: string;
  fullName: string;
  passwordHash: string;
  phone?: string;
  avatarUrl?: string;
}
