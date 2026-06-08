/**
 * Dental schema.org and vertical configuration.
 * Used by the injector to set @type and other vertical-specific defaults.
 */

export const SCHEMA_CONFIG = {
  /** schema.org @type for LocalBusiness */
  businessType: 'Dentist',

  /** Default professional credentials if none detected */
  defaultCredentials: 'DDS',

  /** schema.org priceRange */
  priceRange: '$$',

  /** Default appointment booking CTA label */
  ctaLabel: 'Schedule an Appointment',

  /** Vertical display name (used in UI / logs) */
  verticalName: 'Dental',
};
