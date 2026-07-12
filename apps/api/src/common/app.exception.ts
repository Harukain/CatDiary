import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    public readonly fieldErrors?: Array<{ field: string; code: string }>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }
}
