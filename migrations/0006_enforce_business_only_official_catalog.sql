-- Existing official catalogs should now be available only to business-paid workspaces.
UPDATE books
SET
  catalog_source = COALESCE(catalog_source, 'LICENSED_PARTNER'),
  access_scope = 'BUSINESS_ONLY'
WHERE created_by IS NULL
  AND COALESCE(catalog_source, 'LICENSED_PARTNER') != 'USER_GENERATED'
  AND (
    catalog_source IS NULL
    OR access_scope IS NULL
    OR access_scope != 'BUSINESS_ONLY'
  );
