import { Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { compare as bcryptCompare } from "bcryptjs";

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
  }

  /**
   * Verify password against hash. Supports both new argon2id hashes and legacy bcrypt
   * hashes from the original implementation, easing in-place migration.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      if (hash.startsWith("$argon2")) {
        return await argon2.verify(hash, password);
      }
      if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
        return bcryptCompare(password, hash);
      }
      return false;
    } catch (error) {
      this.logger.warn(`password verification failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** True if a hash string was produced by bcrypt and should be re-hashed. */
  needsRehash(hash: string): boolean {
    return !hash.startsWith("$argon2");
  }
}
