// Matriz de la tarjeta Multibanca No. 0617999453
// Formato: { "A1": "19", "B3": "85", ... }
// Se usa para responder las coordenadas de seguridad durante el login

export const MATRIX: Record<string, string> = {
  // Fila 1
  A1: "19", B1: "97", C1: "29", D1: "11", E1: "56", F1: "40", G1: "00", H1: "39", I1: "90", J1: "92",
  // Fila 2
  A2: "14", B2: "07", C2: "81", D2: "88", E2: "58", F2: "33", G2: "46", H2: "18", I2: "17", J2: "97",
  // Fila 3
  A3: "43", B3: "85", C3: "66", D3: "60", E3: "24", F3: "17", G3: "22", H3: "43", I3: "98", J3: "94",
  // Fila 4
  A4: "70", B4: "88", C4: "53", D4: "66", E4: "78", F4: "08", G4: "13", H4: "02", I4: "10", J4: "72",
  // Fila 5
  A5: "41", B5: "78", C5: "42", D5: "92", E5: "12", F5: "84", G5: "50", H5: "43", I5: "21", J5: "77",
  // Fila 6
  A6: "03", B6: "96", C6: "35", D6: "26", E6: "99", F6: "43", G6: "63", H6: "65", I6: "55", J6: "21",
  // Fila 7
  A7: "97", B7: "42", C7: "81", D7: "50", E7: "83", F7: "84", G7: "90", H7: "32", I7: "06", J7: "98",
  // Fila 8
  A8: "34", B8: "70", C8: "16", D8: "89", E8: "70", F8: "90", G8: "77", H8: "42", I8: "81", J8: "63",
  // Fila 9
  A9: "42", B9: "38", C9: "53", D9: "74", E9: "70", F9: "18", G9: "96", H9: "28", I9: "48", J9: "18",
  // Fila 10
  A10: "51", B10: "66", C10: "10", D10: "09", E10: "00", F10: "69", G10: "10", H10: "67", I10: "17", J10: "62",
};

/**
 * Busca el valor de una coordenada en la matriz.
 * Acepta formatos: "A1", "a1", "A 1", "A-1"
 */
export function getMatrixValue(coordinate: string): string | null {
  const cleaned = coordinate.replace(/[\s\-]/g, '').toUpperCase();
  return MATRIX[cleaned] || null;
}
