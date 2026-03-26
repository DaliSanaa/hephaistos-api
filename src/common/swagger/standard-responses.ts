import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/** Standard validation failure from ValidationPipe. */
export function ApiValidationErrorResponse() {
  return ApiResponse({
    status: 400,
    description: 'Validation error — invalid or missing fields',
  });
}

export function ApiUnauthorizedResponse() {
  return ApiResponse({ status: 401, description: 'Unauthorized' });
}

export function ApiForbiddenResponse() {
  return ApiResponse({ status: 403, description: 'Forbidden' });
}

export function ApiNotFoundResponse() {
  return ApiResponse({ status: 404, description: 'Not found' });
}

export function ApiConflictResponse() {
  return ApiResponse({ status: 409, description: 'Conflict' });
}

export function ApiTooManyRequestsResponse() {
  return ApiResponse({ status: 429, description: 'Rate limited' });
}

/** Wrap common success + validation responses for JSON endpoints. */
export function ApiJsonSuccess(options?: { description?: string }) {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: options?.description ?? 'Success',
    }),
    ApiValidationErrorResponse(),
  );
}
