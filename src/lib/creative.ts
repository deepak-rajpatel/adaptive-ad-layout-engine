// Compatibility re-exports: the creative model lives in the pure engine layer.
export {
  campaignTypes,
  defaultRequired,
  goals,
  offerLimit,
  sample,
  toSpec,
  validateCreative,
  type CampaignType,
  type CreativeData as Creative,
  type CreativeKey,
} from "../engine/creativeModel";
