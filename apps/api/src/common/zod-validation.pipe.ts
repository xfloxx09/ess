import { ArgumentMetadata, BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodSchema } from "zod";

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.join(".") : "(root)",
        code: issue.code,
        message: issue.message,
      }));
      const summary = issues.map((i) => `${i.path}: ${i.message}`).join("; ");
      throw new BadRequestException({
        message: `Validation failed — ${summary}`,
        issues,
      });
    }
    return parsed.data;
  }
}

export const Body$ = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
