export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
  timestamp: number;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    timestamp: number;
  };
}

export function apiSuccess<T>(data: T, status: number = 200): Response {
  return Response.json(
    {
      ok: true,
      data,
      timestamp: Date.now(),
    },
    { status }
  );
}

export function apiError(
  message: string,
  code: string = "BAD_REQUEST",
  status: number = 400,
  requestId?: string
): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
        requestId,
        timestamp: Date.now(),
      },
    },
    { status }
  );
}
