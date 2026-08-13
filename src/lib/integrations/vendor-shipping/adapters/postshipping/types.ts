/**
 * PostShipping (DTDC) API Schema Definitions
 * Exact specification matching doc.postshipping.com/docs/developers/shipment/
 */

export type PostShippingWeightMeasurement = "Kgs" | "KG" | "G" | "LBS";

export interface PostShippingPiece {
  HarmonisedCode: string;
  GoodsDescription: string;
  Quantity: number;
  Weight: number;
  ManufactureCountryCode: string;
  OriginCountryCode: string;
  CurrencyCode: string;
  CustomsValue: string | number;
}

export interface PostShippingItem {
  ItemNoOfPcs: number;
  ItemCubicL: number;
  ItemCubicW: number;
  ItemCubicH: number;
  ItemWeight: number;
  ItemCubicWeight: number;
  ItemDescription: string;
  ItemCustomValue: string | number;
  ItemCustomCurrencyCode: string;
  Notes?: string;
  Pieces: PostShippingPiece[];
}

export interface PostShippingSenderDetails {
  SenderName: string;
  SenderCompanyName?: string;
  SenderCountryCode: string;
  SenderAdd1: string;
  SenderAdd2?: string;
  SenderAdd3?: string;
  SenderAddCity: string;
  SenderAddState: string;
  SenderAddPostcode: string;
  SenderPhone: string;
  SenderEmail?: string;
  SenderFax?: string;
  SenderKycType?: string;
  SenderKycNumber?: string;
}

export interface PostShippingReceiverDetails {
  ReceiverName: string;
  ReceiverCompanyName?: string;
  ReceiverCountryCode: string;
  ReceiverAdd1: string;
  ReceiverAdd2?: string;
  ReceiverAdd3?: string;
  ReceiverAddCity: string;
  ReceiverAddState: string;
  ReceiverAddPostcode: string;
  ReceiverMobile: string;
  ReceiverPhone: string;
  ReceiverEmail?: string;
}

export interface PostShippingPackageDetails {
  GoodsDescription: string;
  CustomValue: string | number;
  CustomCurrencyCode: string;
  InsuranceValue: string | number;
  ShipmentTerm: string;
  GoodsOriginCountryCode: string;
  Weight: number;
  WeightMeasurement: PostShippingWeightMeasurement;
  NoOfItems: number;
  CubicL: number;
  CubicW: number;
  CubicH: number;
  CubicWeight: number;
  ServiceTypeName: string;
  BookPickUP: boolean;
  SenderRef1: string;
  SenderRef2?: string;
  SenderRef3?: string;
  ReasonExport?: string;
  Incoterms?: string;
  ShipmentResponseItem: PostShippingItem[];
}

export interface PostShippingShipmentRequest {
  Pending: boolean;
  ThirdPartyToken?: string;
  SenderDetails: PostShippingSenderDetails;
  ReceiverDetails: PostShippingReceiverDetails;
  PackageDetails: PostShippingPackageDetails;
}

export type PostShippingRequestBody = PostShippingShipmentRequest[];

export interface PostShippingResponse {
  Status?: string;
  Success?: boolean;
  ConsignmentNumber?: string;
  TrackingNumber?: string;
  ShipmentId?: string;
  LabelUrl?: string;
  LabelData?: string;
  ErrorMessage?: string;
  Errors?: string[];
  [key: string]: unknown;
}
