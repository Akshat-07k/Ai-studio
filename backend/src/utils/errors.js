// Errors that carry an HTTP status. The error-handler middleware turns them into
// `{ error: message }` JSON responses; anything else becomes a 500.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class ValidationError extends HttpError {
  constructor(message) {
    super(400, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

// The request is valid but clashes with what's running (e.g. GPU is busy).
export class ConflictError extends HttpError {
  constructor(message) {
    super(409, message);
  }
}

// A downstream engine (ComfyUI, llama-server) rejected the request or is unreachable.
export class UpstreamError extends HttpError {
  constructor(message, status = 503, body = null) {
    super(status, message);
    this.body = body;
  }
}
