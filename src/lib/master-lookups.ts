// Shared lookup option lists sourced from the existing master seeds.
// Used by <SearchField lookup="..." /> across forms so users can pick
// a value from the same list the corresponding master page manages.

import { INTERNATIONAL_DESTINATIONS } from "@/lib/destinations-international-data";

export type LookupOption = { code: string; name: string; hint?: string };

export type LookupKey =
  | "state"
  | "serviceCentre"
  | "product"
  | "salesExecutive"
  | "industry"
  | "country"
  | "destination"
  | "internationalDestination"
  | "zone"
  | "pinCode"
  | "vendor"
  | "contractHead"
  | "ledgerHead"
  | "area"
  | "fieldExecutive"
  | "contactType"
  | "customer"
  | "shipper"
  | "exception"
  | "paymentType"
  | "obc"
  | "serviceType";

const STATES: LookupOption[] = [
  { code: "AN", name: "Andaman & Nicobar Islands" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CH", name: "Chandigarh" },
  { code: "CT", name: "Chhattisgarh" },
  { code: "DL", name: "Delhi" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JK", name: "Jammu & Kashmir" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OR", name: "Odisha" },
  { code: "PY", name: "Puducherry" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UT", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
];

const SERVICE_CENTRES: LookupOption[] = [
  { code: "AKL", name: "AUCKLAND", hint: "AKL" },
  { code: "AM", name: "AUSTRALIA METRO", hint: "AUM" },
  { code: "BAN", name: "Bangalore", hint: "BLR" },
  { code: "CAN", name: "CANADA", hint: "CA" },
  { code: "GUN", name: "GUNTUR", hint: "GUN" },
  { code: "HYD", name: "HYD", hint: "HYD" },
  { code: "KUL", name: "KUALA LUMPUR", hint: "MY" },
  { code: "MAH", name: "MAHARASHTRA", hint: "MAH" },
  { code: "MNL", name: "MANILA (PHILIPPINES)", hint: "PH" },
  { code: "MEL", name: "MELBOURNE", hint: "MEL" },
  { code: "MUM", name: "MUMBAI COURIERWALA", hint: "BOM" },
  { code: "PER", name: "PERTH", hint: "PER" },
  { code: "SYD", name: "SYDNEY", hint: "AER" },
  { code: "UK", name: "UNITED KINGDOM", hint: "GB" },
  { code: "USA", name: "UNITED STATES OF AMERICA", hint: "US" },
];

const PRODUCTS: LookupOption[] = [
  { code: "ADOX", name: "ADOX" },
  { code: "ASPX", name: "ASPX" },
  { code: "COM", name: "COMMERCIAL" },
  { code: "DOCS", name: "DOCUMENTS" },
  { code: "DOX", name: "INTL DOX" },
  { code: "ENV", name: "ENVELOPE" },
  { code: "FOOD", name: "FOOD" },
  { code: "LAP", name: "LAPTOP" },
  { code: "MED", name: "MEDICINE" },
  { code: "MOB", name: "MOBILE" },
  { code: "NDOX", name: "NON DOCUMENTS" },
  { code: "SPX", name: "OTHER PACKAGE" },
  { code: "PACK", name: "PACK" },
  { code: "SPXD", name: "SPXD" },
  { code: "GRMT", name: "GARMENTS" },
  { code: "SPAR", name: "SPARE PARTS" },
  { code: "BOOK", name: "BOOKS" },
  { code: "GIFT", name: "GIFT ITEMS" },
];

const SALES_EXECS: LookupOption[] = [
  { code: "A20", name: "AIHAN ENTERPRISES" },
  { code: "SAI", name: "AMUDALA SIVA SAI" },
  { code: "JVN", name: "JEEVAN" },
  { code: "MNC", name: "MAROJU NAVEEN CHARY" },
  { code: "NTH", name: "NITHIN" },
  { code: "SRA", name: "SRAVANI DONTHU" },
  { code: "Bmk", name: "Vemula sai kiran" },
];

const INDUSTRIES: LookupOption[] = [
  { code: "AGR", name: "Agriculture" },
  { code: "AUT", name: "Automotive" },
  { code: "BNK", name: "Banking & Finance" },
  { code: "CON", name: "Construction" },
  { code: "EDU", name: "Education" },
  { code: "ECM", name: "E-Commerce" },
  { code: "ENR", name: "Energy" },
  { code: "FMC", name: "FMCG" },
  { code: "HLT", name: "Healthcare" },
  { code: "HOS", name: "Hospitality" },
  { code: "INS", name: "Insurance" },
  { code: "ITS", name: "IT Services" },
  { code: "LOG", name: "Logistics" },
  { code: "MFG", name: "Manufacturing" },
  { code: "MED", name: "Media & Entertainment" },
  { code: "PHR", name: "Pharmaceuticals" },
  { code: "RET", name: "Retail" },
  { code: "TEL", name: "Telecommunications" },
  { code: "TEX", name: "Textiles" },
  { code: "TRV", name: "Travel & Tourism" },
];

const COUNTRIES: LookupOption[] = [
  { code: "IN", name: "INDIA" },
  { code: "US", name: "UNITED STATES OF AMERICA" },
  { code: "GB", name: "UNITED KINGDOM" },
  { code: "AU", name: "AUSTRALIA" },
  { code: "CA", name: "CANADA" },
  { code: "AE", name: "UNITED ARAB EMIRATES" },
  { code: "SG", name: "SINGAPORE" },
  { code: "MY", name: "MALAYSIA" },
  { code: "NZ", name: "NEW ZEALAND" },
  { code: "DE", name: "GERMANY" },
  { code: "FR", name: "FRANCE" },
  { code: "JP", name: "JAPAN" },
  { code: "CN", name: "CHINA" },
  { code: "PH", name: "PHILIPPINES" },
  { code: "SA", name: "SAUDI ARABIA" },
];

const DESTINATIONS: LookupOption[] = [
  { code: "HYD", name: "Hyderabad" },
  { code: "BLR", name: "Bangalore" },
  { code: "BOM", name: "Mumbai" },
  { code: "DEL", name: "Delhi" },
  { code: "MAA", name: "Chennai" },
  { code: "CCU", name: "Kolkata" },
  { code: "PNQ", name: "Pune" },
  { code: "AMD", name: "Ahmedabad" },
  { code: "LON", name: "London" },
  { code: "NYC", name: "New York" },
  { code: "DXB", name: "Dubai" },
  { code: "SIN", name: "Singapore" },
];

const INTERNATIONAL_DESTINATION_OPTIONS: LookupOption[] = INTERNATIONAL_DESTINATIONS.map((d) => ({
  code: d.code,
  name: d.name,
}));

const ZONES: LookupOption[] = [
  { code: "1", name: "INTERNATIONAL ZONE 1" },
  { code: "2", name: "INTERNATIONAL ZONE 2" },
  { code: "3", name: "INTERNATIONAL ZONE 3" },
  { code: "4", name: "INTERNATIONAL ZONE 4" },
  { code: "5", name: "INTERNATIONAL ZONE 5" },
  { code: "6", name: "INTERNATIONAL ZONE 6" },
  { code: "7", name: "INTERNATIONAL ZONE 7" },
  { code: "8", name: "INTERNATIONAL ZONE 8" },
  { code: "9", name: "INTERNATIONAL ZONE 9" },
  { code: "10", name: "INTERNATIONAL ZONE 10" },
];

const PIN_CODES: LookupOption[] = [
  { code: "500001", name: "Hyderabad GPO", hint: "Telangana" },
  { code: "500032", name: "Gachibowli", hint: "Telangana" },
  { code: "500081", name: "HITEC City", hint: "Telangana" },
  { code: "560001", name: "Bangalore GPO", hint: "Karnataka" },
  { code: "560066", name: "Whitefield", hint: "Karnataka" },
  { code: "400001", name: "Mumbai GPO", hint: "Maharashtra" },
  { code: "400051", name: "Bandra West", hint: "Maharashtra" },
  { code: "110001", name: "New Delhi GPO", hint: "Delhi" },
  { code: "110016", name: "Hauz Khas", hint: "Delhi" },
  { code: "600001", name: "Chennai GPO", hint: "Tamil Nadu" },
  { code: "700001", name: "Kolkata GPO", hint: "West Bengal" },
  { code: "411001", name: "Pune GPO", hint: "Maharashtra" },
];

const VENDORS: LookupOption[] = [
  { code: "AIC", name: "ATLANTIC INTERNATIONAL COURIER" },
  { code: "ARX", name: "ARAMEX" },
  { code: "BLUE", name: "BLUEDART" },
  { code: "CAPI", name: "CAPTAIN INDIA" },
  { code: "COUR", name: "COURIERWALA" },
  { code: "DHE", name: "FEDEX DL" },
  { code: "DHL", name: "DHL EXPRESS (I) PVT LTD" },
  { code: "DHL1", name: "DHL LSPS" },
  { code: "DHLS", name: "DHL SPECIAL" },
  { code: "DPD", name: "DPD2" },
  { code: "DTAU", name: "DTDC AUSTRALIA" },
  { code: "DTDC", name: "DPD UK" },
  { code: "DTMA", name: "DTDC MALAYSIA" },
  { code: "DTNZ", name: "DTDC NEWZEALAND" },
  { code: "ECAR", name: "E CARGO" },
  { code: "FDEX", name: "FEDEX 1" },
  { code: "FDX", name: "FEDERAL EXPRESS CORPORATION" },
  { code: "FEDE", name: "FEDEX" },
  { code: "GST", name: "GST BILL" },
  { code: "ICL", name: "ICL" },
  { code: "SWWE", name: "SKYNET" },
  { code: "UPS", name: "UNITED PARCEL SERVICE" },
  { code: "UPS2", name: "UNITED PARCEL SERVICES" },
  { code: "UPS3", name: "UNITED PARCEL SERVICESS" },
  { code: "USAF", name: "USA FedEx" },
  { code: "WFEM", name: "WORLDWIDE EFFECTIVE FREIGHT MANAGEMENT" },
  { code: "WFT", name: "WORLD FRIEGT TRANSPORTATION" },
  { code: "WWEC", name: "WORLDWIDE EXPRESS COURIER" },
];

const HEADS: LookupOption[] = [
  { code: "H001", name: "Sales Revenue" },
  { code: "H002", name: "Service Revenue" },
  { code: "H003", name: "Freight Income" },
  { code: "H004", name: "Fuel Surcharge" },
  { code: "H005", name: "Handling Charges" },
];

const AREAS: LookupOption[] = [
  { code: "HYD", name: "HYD" },
  { code: "A01", name: "Central" },
  { code: "A02", name: "North" },
  { code: "A03", name: "South" },
  { code: "A04", name: "East" },
  { code: "A05", name: "West" },
];

const FIELD_EXECS: LookupOption[] = [
  { code: "AKHIL", name: "AKHIL CW" },
  { code: "AKSHITH", name: "AKSHITH" },
  { code: "ANIL", name: "ANIL CW" },
  { code: "BHAVANI", name: "BHAVANI" },
  { code: "CHANDU", name: "CHANDU" },
  { code: "DINESH", name: "DINESH" },
  { code: "KRISHNA", name: "KRISHNA" },
  { code: "MAHESH", name: "MAHESH" },
  { code: "NITHIN", name: "NITHIN" },
  { code: "PAVAN", name: "PAVAN CW" },
  { code: "RAJU", name: "RAJU" },
  { code: "SURESH", name: "SURESH CW" },
  { code: "VARUN", name: "VANTEDDU ARUN" },
  { code: "VIJAY", name: "VIJAY" },
];

const CONTACT_TYPES: LookupOption[] = [
  { code: "OWN", name: "Owner" },
  { code: "MGR", name: "Manager" },
  { code: "ACC", name: "Accounts" },
  { code: "OPS", name: "Operations" },
  { code: "SLS", name: "Sales" },
  { code: "SUP", name: "Support" },
];

const CUSTOMERS: LookupOption[] = [
  { code: "C001", name: "AIHAN ENTERPRISES" },
  { code: "C002", name: "GLOBAL TRADERS PVT LTD" },
  { code: "C003", name: "HYDERABAD EXPORTS" },
  { code: "C004", name: "METRO LOGISTICS" },
  { code: "C005", name: "SUNRISE COURIER CLIENT" },
];

const SHIPPERS: LookupOption[] = [
  { code: "S001", name: "ABC SHIPPING CO" },
  { code: "S002", name: "DELTA FREIGHT" },
  { code: "S003", name: "HYD PACKERS" },
  { code: "S004", name: "OM LOGISTICS SHIPPER" },
  { code: "S005", name: "PRIME DISPATCH" },
];

const EXCEPTIONS: LookupOption[] = [
  { code: "CD", name: "ARRIVED AT DESTINATION" },
  { code: "AF", name: "ARRIVED AT FACILITY" },
  { code: "AT", name: "ARRIVED HUB" },
  { code: "AC", name: "AWAITING CUSTOM CLEARANCE" },
  { code: "OK", name: "Delivered" },
  { code: "DD", name: "DEPARTED FROM FACILITY" },
  { code: "CL", name: "CUSTOMS HELD" },
  { code: "CA", name: "CUSTOMS AUTHORIZED" },
];

const PAYMENT_TYPES: LookupOption[] = [
  { code: "CSH", name: "Cash" },
  { code: "CHQ", name: "Cheque" },
  { code: "CRD", name: "Credit" },
  { code: "TPY", name: "To Pay" },
  { code: "FOD", name: "FOD" },
];

const OBC_ENTRIES: LookupOption[] = [
  { code: "OBC001", name: "OBC HYD - BOM" },
  { code: "OBC002", name: "OBC DEL - BLR" },
  { code: "OBC003", name: "OBC MUM - CCU" },
  { code: "OBC004", name: "OBC BLR - MAA" },
  { code: "OBC005", name: "OBC HYD - DEL" },
];

const SERVICE_TYPES: LookupOption[] = [
  { code: "DOX", name: "DOX" },
  { code: "SPX", name: "SPX" },
  { code: "NDOX", name: "NDOX" },
  { code: "ENV", name: "ENV" },
];

export const MASTER_LOOKUPS: Record<LookupKey, { title: string; options: LookupOption[]; hintLabel?: string }> = {
  state: { title: "Select State", options: STATES },
  serviceCentre: { title: "Select Service Centre", options: SERVICE_CENTRES, hintLabel: "Branch" },
  product: { title: "Select Product", options: PRODUCTS },
  salesExecutive: { title: "Select Sales Executive", options: SALES_EXECS },
  industry: { title: "Select Industry", options: INDUSTRIES },
  country: { title: "Select Country", options: COUNTRIES },
  destination: { title: "Select Destination", options: DESTINATIONS },
  internationalDestination: {
    title: "Select Destination",
    options: INTERNATIONAL_DESTINATION_OPTIONS,
  },
  zone: { title: "Select Zone", options: ZONES },
  pinCode: { title: "Select Pin Code", options: PIN_CODES, hintLabel: "State" },
  vendor: { title: "Select Vendor", options: VENDORS },
  contractHead: { title: "Select Contract Head", options: HEADS },
  ledgerHead: { title: "Select Ledger Head", options: HEADS },
  area: { title: "Select Area", options: AREAS },
  fieldExecutive: { title: "Select Field Executive", options: FIELD_EXECS },
  contactType: { title: "Select Contact Type", options: CONTACT_TYPES },
  customer: { title: "Select Customer", options: CUSTOMERS },
  shipper: { title: "Select Shipper", options: SHIPPERS },
  exception: { title: "Select Exception", options: EXCEPTIONS },
  paymentType: { title: "Select Payment Type", options: PAYMENT_TYPES },
  obc: { title: "Select OBC", options: OBC_ENTRIES },
  serviceType: { title: "Select Service Type", options: SERVICE_TYPES },
};
