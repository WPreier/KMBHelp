import argon2 from 'argon2';

const options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashLocalPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyLocalPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
