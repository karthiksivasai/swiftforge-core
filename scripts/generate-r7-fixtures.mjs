import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../e2e/fixtures');
if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

// 1. MTS Excel File (5 boxes)
// Headers: Measurement Unit, Actl Weight/PCS, No. Of Pieces, Length, Width, Height
const mtsRows = [
  { 'Measurement Unit': 'C', 'Actl Weight/PCS': '1.0', 'No. Of Pieces': '1', Length: '20', Width: '20', Height: '20' },
  { 'Measurement Unit': 'C', 'Actl Weight/PCS': '1.5', 'No. Of Pieces': '1', Length: '25', Width: '20', Height: '15' },
  { 'Measurement Unit': 'C', 'Actl Weight/PCS': '2.0', 'No. Of Pieces': '1', Length: '30', Width: '20', Height: '20' },
  { 'Measurement Unit': 'C', 'Actl Weight/PCS': '1.2', 'No. Of Pieces': '1', Length: '20', Width: '15', Height: '15' },
  { 'Measurement Unit': 'C', 'Actl Weight/PCS': '2.5', 'No. Of Pieces': '1', Length: '35', Width: '25', Height: '20' },
];

const mtsWb = XLSX.utils.book_new();
const mtsWs = XLSX.utils.json_to_sheet(mtsRows);
XLSX.utils.book_append_sheet(mtsWb, mtsWs, 'Sheet1');
const mtsPath = path.join(fixturesDir, 'mts-5boxes.xlsx');
XLSX.writeFile(mtsWb, mtsPath);
console.log('Created MTS fixture:', mtsPath);

// 2. Proforma Excel File (15 lines across boxes 1-5)
// Headers: Box No, Packages, Description, HSN Code, Quantity, Weight, Unit, Rate, IGST %, IGST Amount
const proformaRows = [
  // Box 1
  { 'Box No': '1', Packages: '1', Description: 'Cotton shirts', 'HSN Code': '6205', Quantity: '2', Weight: '0.4', Unit: 'PCS', Rate: '500', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '1', Packages: '1', Description: 'Linen trousers', 'HSN Code': '6203', Quantity: '1', Weight: '0.4', Unit: 'PCS', Rate: '800', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '1', Packages: '1', Description: 'Silk tie', 'HSN Code': '6215', Quantity: '1', Weight: '0.2', Unit: 'PCS', Rate: '300', 'IGST %': '0', 'IGST Amount': '0' },
  // Box 2
  { 'Box No': '2', Packages: '1', Description: 'Wool scarf', 'HSN Code': '6214', Quantity: '2', Weight: '0.5', Unit: 'PCS', Rate: '600', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '2', Packages: '1', Description: 'Leather belt', 'HSN Code': '4203', Quantity: '1', Weight: '0.3', Unit: 'PCS', Rate: '450', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '2', Packages: '1', Description: 'Cotton socks', 'HSN Code': '6115', Quantity: '5', Weight: '0.7', Unit: 'PRS', Rate: '100', 'IGST %': '0', 'IGST Amount': '0' },
  // Box 3
  { 'Box No': '3', Packages: '1', Description: 'Ceramic mug', 'HSN Code': '6912', Quantity: '2', Weight: '0.8', Unit: 'PCS', Rate: '250', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '3', Packages: '1', Description: 'Notebook', 'HSN Code': '4820', Quantity: '3', Weight: '0.6', Unit: 'PCS', Rate: '150', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '3', Packages: '1', Description: 'Metal pen', 'HSN Code': '9608', Quantity: '2', Weight: '0.6', Unit: 'PCS', Rate: '200', 'IGST %': '0', 'IGST Amount': '0' },
  // Box 4
  { 'Box No': '4', Packages: '1', Description: 'Herbal tea', 'HSN Code': '0902', Quantity: '2', Weight: '0.5', Unit: 'BOX', Rate: '350', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '4', Packages: '1', Description: 'Assorted cookies', 'HSN Code': '1905', Quantity: '2', Weight: '0.4', Unit: 'BOX', Rate: '300', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '4', Packages: '1', Description: 'Spice mix', 'HSN Code': '0910', Quantity: '1', Weight: '0.3', Unit: 'PAC', Rate: '200', 'IGST %': '0', 'IGST Amount': '0' },
  // Box 5
  { 'Box No': '5', Packages: '1', Description: 'Brass idol', 'HSN Code': '7419', Quantity: '1', Weight: '1.2', Unit: 'PCS', Rate: '1200', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '5', Packages: '1', Description: 'Incense sticks', 'HSN Code': '3307', Quantity: '4', Weight: '0.8', Unit: 'BOX', Rate: '100', 'IGST %': '0', 'IGST Amount': '0' },
  { 'Box No': '5', Packages: '1', Description: 'Wooden coaster set', 'HSN Code': '4421', Quantity: '2', Weight: '0.5', Unit: 'SET', Rate: '400', 'IGST %': '0', 'IGST Amount': '0' },
];

const proformaWb = XLSX.utils.book_new();
const proformaWs = XLSX.utils.json_to_sheet(proformaRows);
XLSX.utils.book_append_sheet(proformaWb, proformaWs, 'Sheet1');
const proformaPath = path.join(fixturesDir, 'proforma-15lines.xlsx');
XLSX.writeFile(proformaWb, proformaPath);
console.log('Created Proforma fixture:', proformaPath);

