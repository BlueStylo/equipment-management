type VersionConfig = {
  dataCodewords: number;
  eccCodewords: number;
  blocks: number[];
  alignment: number[];
};

const VERSION_CONFIG: Record<number, VersionConfig> = {
  1: { dataCodewords: 19, eccCodewords: 7, blocks: [19], alignment: [] },
  2: { dataCodewords: 34, eccCodewords: 10, blocks: [34], alignment: [6, 18] },
  3: { dataCodewords: 55, eccCodewords: 15, blocks: [55], alignment: [6, 22] },
  4: { dataCodewords: 80, eccCodewords: 20, blocks: [80], alignment: [6, 26] },
  5: { dataCodewords: 108, eccCodewords: 26, blocks: [108], alignment: [6, 30] },
  6: { dataCodewords: 136, eccCodewords: 18, blocks: [68, 68], alignment: [6, 34] },
  7: { dataCodewords: 156, eccCodewords: 20, blocks: [78, 78], alignment: [6, 22, 38] },
  8: { dataCodewords: 194, eccCodewords: 24, blocks: [97, 97], alignment: [6, 24, 42] },
  9: { dataCodewords: 232, eccCodewords: 30, blocks: [116, 116], alignment: [6, 26, 46] },
  10: { dataCodewords: 274, eccCodewords: 18, blocks: [68, 68, 69, 69], alignment: [6, 28, 50] },
};

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);

let gfValue = 1;
for (let i = 0; i < 255; i += 1) {
  EXP[i] = gfValue;
  LOG[gfValue] = i;
  gfValue <<= 1;
  if (gfValue & 0x100) {
    gfValue ^= 0x11d;
  }
}
for (let i = 255; i < EXP.length; i += 1) {
  EXP[i] = EXP[i - 255];
}

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) {
    return 0;
  }

  return EXP[LOG[left] + LOG[right]];
}

function reedSolomonGenerator(degree: number) {
  let coefficients = [1];

  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(coefficients.length + 1).fill(0);
    for (let j = 0; j < coefficients.length; j += 1) {
      next[j] ^= coefficients[j];
      next[j + 1] ^= gfMultiply(coefficients[j], EXP[i]);
    }
    coefficients = next;
  }

  return coefficients;
}

function reedSolomonRemainder(data: number[], degree: number) {
  const generator = reedSolomonGenerator(degree).slice(1);
  const remainder = new Array<number>(degree).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);

    for (let i = 0; i < degree; i += 1) {
      remainder[i] ^= gfMultiply(generator[i], factor);
    }
  }

  return remainder;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function makeDataCodewords(value: string, version: number, capacity: number) {
  const bytes = Array.from(new TextEncoder().encode(value));
  const countBits = version < 10 ? 8 : 16;
  const bits: number[] = [];

  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, countBits);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  appendBits(bits, 0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(Number.parseInt(bits.slice(i, i + 8).join(""), 2));
  }

  for (let pad = 0xec; codewords.length < capacity; pad = pad === 0xec ? 0x11 : 0xec) {
    codewords.push(pad);
  }

  return codewords;
}

function interleaveCodewords(dataCodewords: number[], config: VersionConfig) {
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;

  for (const blockLength of config.blocks) {
    const block = dataCodewords.slice(offset, offset + blockLength);
    offset += blockLength;
    dataBlocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, config.eccCodewords));
  }

  const interleaved: number[] = [];
  const maxDataLength = Math.max(...dataBlocks.map((block) => block.length));

  for (let index = 0; index < maxDataLength; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        interleaved.push(block[index]);
      }
    }
  }

  for (let index = 0; index < config.eccCodewords; index += 1) {
    for (const block of eccBlocks) {
      interleaved.push(block[index]);
    }
  }

  return interleaved;
}

function maskBit(mask: number, x: number, y: number) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function bchFormatBits(mask: number) {
  const data = (0b01 << 3) | mask;
  let remainder = data;

  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
  }

  return ((data << 10) | (remainder & 0x3ff)) ^ 0x5412;
}

function bchVersionBits(version: number) {
  let remainder = version;

  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) ? 0x1f25 : 0);
  }

  return (version << 12) | (remainder & 0xfff);
}

function placeFormatBits(matrix: boolean[][], mask: number) {
  const size = matrix.length;
  const bits = bchFormatBits(mask);
  const getBit = (index: number) => ((bits >>> index) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) matrix[i][8] = getBit(i);
  matrix[7][8] = getBit(6);
  matrix[8][8] = getBit(7);
  matrix[8][7] = getBit(8);
  for (let i = 9; i < 15; i += 1) matrix[8][14 - i] = getBit(i);
  for (let i = 0; i < 8; i += 1) matrix[8][size - 1 - i] = getBit(i);
  for (let i = 8; i < 15; i += 1) matrix[size - 15 + i][8] = getBit(i);
  matrix[size - 8][8] = true;
}

function placeVersionBits(matrix: boolean[][], version: number) {
  if (version < 7) {
    return;
  }

  const size = matrix.length;
  const bits = bchVersionBits(version);

  for (let i = 0; i < 18; i += 1) {
    const bit = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    matrix[b][a] = bit;
    matrix[a][b] = bit;
  }
}

function addFunctionPatterns(
  matrix: Array<Array<boolean | null>>,
  isFunction: boolean[][],
  version: number,
) {
  const size = matrix.length;
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return;
    }
    matrix[y][x] = dark;
    isFunction[y][x] = true;
  };
  const addFinder = (left: number, top: number) => {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const xx = left + x;
        const yy = top + y;
        const dark =
          x >= 0 &&
          x <= 6 &&
          y >= 0 &&
          y <= 6 &&
          (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        setFunction(xx, yy, dark);
      }
    }
  };

  addFinder(0, 0);
  addFinder(size - 7, 0);
  addFinder(0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    setFunction(i, 6, dark);
    setFunction(6, i, dark);
  }

  for (const y of VERSION_CONFIG[version].alignment) {
    for (const x of VERSION_CONFIG[version].alignment) {
      if (isFunction[y][x]) {
        continue;
      }

      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(x + dx, y + dy, distance !== 1);
        }
      }
    }
  }

  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      setFunction(8, i, false);
      setFunction(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setFunction(size - 1 - i, 8, false);
    setFunction(8, size - 1 - i, false);
  }
  setFunction(8, size - 8, true);

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, false);
      setFunction(b, a, false);
    }
  }
}

function placeData(matrix: Array<Array<boolean | null>>, isFunction: boolean[][], codewords: number[]) {
  const size = matrix.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;

      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx;
        if (isFunction[y][x]) {
          continue;
        }

        const codeword = codewords[Math.floor(bitIndex / 8)] ?? 0;
        matrix[y][x] = ((codeword >>> (7 - (bitIndex % 8))) & 1) === 1;
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function penaltyScore(matrix: boolean[][]) {
  const size = matrix.length;
  let score = 0;
  let darkCount = 0;

  for (let y = 0; y < size; y += 1) {
    let runColor = matrix[y][0];
    let runLength = 1;
    for (let x = 0; x < size; x += 1) {
      if (matrix[y][x]) darkCount += 1;
      if (x === 0) continue;
      if (matrix[y][x] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) score += 3 + runLength - 5;
        runColor = matrix[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + runLength - 5;
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = matrix[0][x];
    let runLength = 1;
    for (let y = 1; y < size; y += 1) {
      if (matrix[y][x] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) score += 3 + runLength - 5;
        runColor = matrix[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + runLength - 5;
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) {
        score += 3;
      }
    }
  }

  const pattern = "1011101";
  const penalizeLine = (line: boolean[]) => {
    const text = line.map((cell) => (cell ? "1" : "0")).join("");
    for (let index = 0; index <= text.length - 7; index += 1) {
      if (text.slice(index, index + 7) !== pattern) continue;
      const before = text.slice(Math.max(0, index - 4), index);
      const after = text.slice(index + 7, index + 11);
      if (before === "0000" || after === "0000") score += 40;
    }
  };

  for (let y = 0; y < size; y += 1) penalizeLine(matrix[y]);
  for (let x = 0; x < size; x += 1) penalizeLine(matrix.map((row) => row[x]));

  const darkRatio = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(darkRatio - 50) / 5) * 10;

  return score;
}

function chooseVersion(value: string) {
  const bytes = new TextEncoder().encode(value).length;

  for (const [versionText, config] of Object.entries(VERSION_CONFIG)) {
    const version = Number(versionText);
    const countBits = version < 10 ? 8 : 16;
    const requiredBits = 4 + countBits + bytes * 8;

    if (requiredBits <= config.dataCodewords * 8) {
      return version;
    }
  }

  throw new Error("QR 코드에 담을 URL이 너무 깁니다.");
}

function makeMatrix(value: string) {
  const version = chooseVersion(value);
  const config = VERSION_CONFIG[version];
  const size = 21 + (version - 1) * 4;
  const matrix = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null));
  const isFunction = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  addFunctionPatterns(matrix, isFunction, version);
  placeData(matrix, isFunction, interleaveCodewords(makeDataCodewords(value, version, config.dataCodewords), config));

  let bestMatrix: boolean[][] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = matrix.map((row, y) =>
      row.map((cell, x) => {
        const dark = Boolean(cell);
        return isFunction[y][x] ? dark : dark !== maskBit(mask, x, y);
      }),
    );
    placeFormatBits(candidate, mask);
    placeVersionBits(candidate, version);
    const score = penaltyScore(candidate);

    if (score < bestScore) {
      bestMatrix = candidate;
      bestScore = score;
    }
  }

  return bestMatrix ?? matrix.map((row) => row.map(Boolean));
}

export function QrCode({
  value,
  title,
  className,
}: {
  value: string;
  title?: string;
  className?: string;
}) {
  const quietZone = 4;
  let matrix: boolean[][];

  try {
    matrix = makeMatrix(value);
  } catch {
    matrix = makeMatrix(value.slice(0, 180));
  }

  const size = matrix.length;
  const viewSize = size + quietZone * 2;
  const path = matrix
    .flatMap((row, y) =>
      row.map((dark, x) => (dark ? `M${x + quietZone},${y + quietZone}h1v1h-1z` : "")),
    )
    .filter(Boolean)
    .join("");

  return (
    <svg
      aria-label={title ?? "QR 코드"}
      className={className}
      role="img"
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect width={viewSize} height={viewSize} fill="#fff" />
      <path d={path} fill="currentColor" />
    </svg>
  );
}
