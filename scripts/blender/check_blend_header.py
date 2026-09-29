"""Diagnose a .blend file header and walk its block chain. Read-only.

A .blend starts with a 12-byte header: b"BLENDER" + pointer-size char ('-' = 8 byte,
'_' = 4 byte) + endian char ('v' = little, 'V' = big) + 3 ASCII version digits.
Everything after is a chain of blocks: 4-byte code, 4-byte length, pointer, SDNA
index, count, then `length` bytes of data. Blocks reference each other by the
*memory addresses* saved at write time, not by file offset — so if a bad header is
purely extra inserted bytes, dropping them restores a parseable chain. Walking the
chain to a terminating ENDB is what proves that, so we never guess.

Usage: python check_blend_header.py <file.blend> [assumed_header_len]
"""
import struct
import sys


def walk(data: bytes, start: int, limit: int = 10_000_000):
    """Walk the block chain from `start`. Returns (ok, blocks, detail)."""
    ptr_size = 8 if data[7:8] == b"-" else 4
    endian = "<" if data[8:9] == b"v" else ">"
    off = start
    blocks = []
    while len(blocks) < limit:
        if off + 8 > len(data):
            return False, blocks, f"ran off the end at offset {off}"
        code = data[off:off + 4]
        if code == b"ENDB":
            return True, blocks, f"clean chain, ENDB at {off}"
        (length,) = struct.unpack(endian + "I", data[off + 4:off + 8])
        head = 8 + ptr_size + 8
        if not code.strip(b"\x00").isalnum() and code not in (b"DNA1",):
            return False, blocks, f"non-ASCII block code {code!r} at {off}"
        if length < 0 or off + head + length > len(data):
            return False, blocks, f"block {code!r} at {off} claims impossible length {length}"
        blocks.append((code, off, length))
        off += head + length
    return False, blocks, "block limit reached"


def main():
    path = sys.argv[1]
    with open(path, "rb") as f:
        data = f.read()

    print(f"file: {path}")
    print(f"size: {len(data)}")
    print(f"first 24 bytes: {data[:24]!r}")

    if data[:7] != b"BLENDER":
        print("VERDICT: not a blend file at all (no BLENDER magic)")
        return

    print(f"declared pointer char: {data[7:8]!r}  endian char: {data[8:9]!r}  version: {data[9:12]!r}")

    # Where does the first real block start? Try the standard 12, then scan for a
    # plausible first block code, which for a Blender save is almost always REND.
    first_rend = data.find(b"REND")
    print(f"first b'REND' at offset: {first_rend}")
    print(f"last b'ENDB' at offset: {data.rfind(b'ENDB')}")

    candidates = [12]
    if first_rend > 0:
        candidates.append(first_rend)
    if len(sys.argv) > 2:
        candidates.insert(0, int(sys.argv[2]))

    for start in dict.fromkeys(candidates):
        ok, blocks, detail = walk(data, start)
        print(f"\n-- walking from offset {start}: {'OK' if ok else 'FAILED'} — {detail}")
        print(f"   blocks parsed: {len(blocks)}")
        if blocks:
            codes = [b[0].decode('ascii', 'replace') for b in blocks[:8]]
            print(f"   first codes: {codes}")
            has_dna = any(b[0] == b"DNA1" for b in blocks)
            print(f"   DNA1 present: {has_dna}")


if __name__ == "__main__":
    main()
