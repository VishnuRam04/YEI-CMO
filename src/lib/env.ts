const SERVER_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number];

export function requireServerEnv(key: ServerEnvKey): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env.local and add the credential.`,
    );
  }
  return value;
}

export function serverEnvStatus(): Record<ServerEnvKey, boolean> {
  return Object.fromEntries(
    SERVER_ENV_KEYS.map((key) => [key, Boolean(process.env[key]?.trim())]),
  ) as Record<ServerEnvKey, boolean>;
}
