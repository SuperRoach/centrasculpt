import { hostname, networkInterfaces } from "node:os";

export const machineHostname = hostname().toLowerCase();
export const machineLocalHostname = machineHostname.endsWith(".local")
  ? machineHostname
  : `${machineHostname}.local`;

const isPrivateIPv4 = (address) => {
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168))
  );
};

export const lanHostnames = [
  ...new Set([
    "localhost",
    "127.0.0.1",
    machineHostname,
    machineLocalHostname,
    ...Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal && isPrivateIPv4(entry.address))
      .map((entry) => entry.address),
  ]),
];
