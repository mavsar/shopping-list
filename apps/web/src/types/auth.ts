export type AuthUser = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export type ManagedUser = {
  id: number;
  username: string;
  name: string;
  email: string | null;
  isAdmin: number | boolean;
  createdAt: string;
};
