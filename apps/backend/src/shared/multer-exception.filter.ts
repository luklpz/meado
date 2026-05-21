import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ statusCode: 413, message: 'El archivo supera el límite de tamaño permitido.', error: 'Payload Too Large' });
    } else {
      res.status(400).json({ statusCode: 400, message: `Error al procesar el archivo: ${exception.message}`, error: 'Bad Request' });
    }
  }
}
