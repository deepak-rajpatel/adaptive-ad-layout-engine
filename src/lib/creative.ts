// Compatibility re-exports: the creative model lives in the pure engine layer.
export {
  campaignCta,
  campaignTypes,
  defaultRequired,
  effectivePriorities,
  goalPriorities,
  hasContent,
  goals,
  offerLimit,
  sample,
  toSpec,
  validateCreative,
  type CampaignType,
  type CreativeData as Creative,
  type CreativeKey,
} from "../engine/creativeModel";
