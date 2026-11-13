/** Decode one address from the bytes exposed by an ADDR parameter. */
export function decodeAddressBytes(bytes: readonly (number | string)[]) {
    if (bytes.length !== 4 ||
        !bytes.every((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)) return;
    const [source, node, channel, packed] = bytes;
    return { source, node, channel, parameter: packed & 0x3f };
}
