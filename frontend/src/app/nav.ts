// Navigation indirection so screens do not import the router instance directly.
let navigateImpl: (path: string, replace?: boolean) => void = (p) => {
  location.hash = p;
};

export function setNavigator(fn: (path: string, replace?: boolean) => void): void {
  navigateImpl = fn;
}

export function navigate(path: string, replace = false): void {
  navigateImpl(path, replace);
}
