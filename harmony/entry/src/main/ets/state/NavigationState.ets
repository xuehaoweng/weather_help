export interface NavigationState {
  loading: boolean;
  failed: boolean;
}

export function navigationStarted(): NavigationState {
  return {
    loading: true,
    failed: false,
  };
}

export function navigationFailed(): NavigationState {
  return {
    loading: false,
    failed: true,
  };
}

export function navigationEnded(failed: boolean): NavigationState {
  return {
    loading: false,
    failed,
  };
}
