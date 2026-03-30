export const AUTH_MESSAGES = {
  LOGIN_SUCCESS: "Login successful",
  REFRESH_SUCCESS: "Session refreshed successfully",
  LOGOUT_SUCCESS: "Logged out successfully",
  LOGOUT_ALL_SUCCESS: "Logged out from all sessions successfully",
  INVALID_CREDENTIALS: "Invalid username or password",
  UNAUTHORIZED: "Session expired. Please log in again.",
  SESSION_INVALID: "Your session is no longer valid. Please sign in again.",
  FORBIDDEN: "You are not authorized to access this resource"
} as const;
