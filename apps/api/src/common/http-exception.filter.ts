import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const isAppException = exception instanceof AppException;
    const requestId = request.requestId ?? 'unknown';
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          route: request.url,
          message: exception instanceof Error ? exception.message : 'unknown error',
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    response.status(status).json({
      error: {
        code: isAppException ? exception.code : status === 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
        message: isAppException
          ? exception.message
          : status === 500
            ? '服务暂时不可用，请稍后重试'
            : String((exception as Error)?.message ?? '请求失败'),
        ...(isAppException && exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
        ...(isAppException && exception.details ? { details: exception.details } : {}),
      },
      meta: { requestId },
    });
  }
}
