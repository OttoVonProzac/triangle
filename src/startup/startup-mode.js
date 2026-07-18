export function isDemoModeLocation(location = window.location) {
  return (
    location.protocol === "file:" ||
    new URLSearchParams(location.search).get("demo") === "1"
  );
}
