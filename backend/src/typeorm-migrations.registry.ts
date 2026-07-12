import { InitSchema1730246400000 } from "./migrations/1730246400000-InitSchema";
import { AddJobModelColumns1730332800000 } from "./migrations/1730332800000-AddJobModelColumns";
import { AddJobCancelledStatus1730500000000 } from "./migrations/1730500000000-AddJobCancelledStatus";
import { AddJobAiProvider1730600000000 } from "./migrations/1730600000000-AddJobAiProvider";
import { AddFinancialExtractionEntities1730700000000 } from "./migrations/1730700000000-AddFinancialExtractionEntities";
import { AddInvoiceStatementLineTables1730800000000 } from "./migrations/1730800000000-AddInvoiceStatementLineTables";
import { AiExecutionsAndPricing1730900000000 } from "./migrations/1730900000000-AiExecutionsAndPricing";
import { AddUsers1743459600000 } from "./migrations/1743459600000-AddUsers";
import { AddRoles1743460200000 } from "./migrations/1743460200000-AddRoles";
import { AddUserRoles1743461100000 } from "./migrations/1743461100000-AddUserRoles";
import { AllowNullUserRoleCustomerId1743462000000 } from "./migrations/1743462000000-AllowNullUserRoleCustomerId";
import { ApplySkippedEarlyGuardSchema1743462100000 } from "./migrations/1743462100000-ApplySkippedEarlyGuardSchema";
import { SeedDefaultAdminUser1743462150000 } from "./migrations/1743462150000-SeedDefaultAdminUser";
import { AddCustomerOnboardingData1743600000000 } from "./migrations/1743600000000-AddCustomerOnboardingData";
import { CreateCustomerAppRole_1743600000000 } from "./migrations/1743600000000-CreateCustomerAppRole";
import { GrantPgBossToCustomerApp_1743600001000 } from "./migrations/1743600001000-GrantPgBossToCustomerApp";
import { AddCustomerFormSubmission1743700000000 } from "./migrations/1743700000000-AddCustomerFormSubmission";
import { AddIsAdminToUsers_1733158200000 } from "./migrations/1733158200000-AddIsAdminToUsers";
import { DropCustomerIdFromUserRoles_1733155200000 } from "./migrations/1733155200000-DropCustomerIdFromUserRoles";
import { EnableRlsPolicies_1733159400000 } from "./migrations/1733159400000-EnableRlsPolicies";
import { CustomersRlsWritePolicies1743800000000 } from "./migrations/1743800000000-CustomersRlsWritePolicies";
import { DummyTestMigration1743900000000 } from "./migrations/1743900000000-DummyTestMigration";
import { CustomerFormSubmissionMetadata1744000000000 } from "./migrations/1744000000000-CustomerFormSubmissionMetadata";
import { SignatureLinkViewedStatus1744020000000 } from "./migrations/1744020000000-SignatureLinkViewedStatus";
import { FormSubmissionStatusDraftCompletedOnly1744030000000 } from "./migrations/1744030000000-FormSubmissionStatusDraftCompletedOnly";
import { AddSubscriptionPlanTable1745000000000 } from "./migrations/1745000000000-AddSubscriptionPlanTable";
import { SubscriptionPlanBandsAndCustomerTurnover1745100000000 } from "./migrations/1745100000000-SubscriptionPlanBandsAndCustomerTurnover";
import { SeedCustomerPortalRole1745200000000 } from "./migrations/1745200000000-SeedCustomerPortalRole";
import { StaffRoleAndSubscriptionPermissions1745300000000 } from "./migrations/1745300000000-StaffRoleAndSubscriptionPermissions";
import { AddFilesMetadata1745400000000 } from "./migrations/1745400000000-AddFilesMetadata";
import { AddCustomerFoldersAndDocuments1745500000000 } from "./migrations/1745500000000-AddCustomerFoldersAndDocuments";
import { EnableRlsFoldersAndDocuments1745600000000 } from "./migrations/1745600000000-EnableRlsFoldersAndDocuments";
import { JobsReferenceDocuments1746000000000 } from "./migrations/1746000000000-JobsReferenceDocuments";
import { AddCustomerUsers1746100000000 } from "./migrations/1746100000000-AddCustomerUsers";
import { FilesAndDocumentsS3Key1746200000000 } from "./migrations/1746200000000-FilesAndDocumentsS3Key";
import { AddStaffCustomerAssignments1746300000000 } from "./migrations/1746300000000-AddStaffCustomerAssignments";
import { AddStaffCustomerAssignmentRlsPolicies1746310000000 } from "./migrations/1746310000000-AddStaffCustomerAssignmentRlsPolicies";
import { FixStaffAssignmentRlsCorrelations1746320000000 } from "./migrations/1746320000000-FixStaffAssignmentRlsCorrelations";
import { AddDocumentAssignees1746330000000 } from "./migrations/1746330000000-AddDocumentAssignees";
import { SeedManagerAccountantAndCustomerRoles1747000000000 } from "./migrations/1747000000000-SeedManagerAccountantAndCustomerRoles";
import { EnforceFourRolesAndPermissions1747100000000 } from "./migrations/1747100000000-EnforceFourRolesAndPermissions";
import { AddPlanPricingFeaturesUserSubscription1747200000000 } from "./migrations/1747200000000-AddPlanPricingFeaturesUserSubscription";
import { ReplacePlanTablesWithCustomerTypePlansMatrix1747300000000 } from "./migrations/1747300000000-ReplacePlanTablesWithCustomerTypePlansMatrix";
import { SeedCustomerTypesIfMissing1747310000000 } from "./migrations/1747310000000-SeedCustomerTypesIfMissing";
import { ReplacePlanAddonsWithVatDormantColumns1747320000000 } from "./migrations/1747320000000-ReplacePlanAddonsWithVatDormantColumns";
import { AddPlansIsActive1747350000000 } from "./migrations/1747350000000-AddPlansIsActive";
import { PlanCustomerTypesManyToMany1747360000000 } from "./migrations/1747360000000-PlanCustomerTypesManyToMany";
import { AddPlanServicesTables1747370000000 } from "./migrations/1747370000000-AddPlanServicesTables";
import { AddIsIncludedToServicesAndPlanService1747380000000 } from "./migrations/1747380000000-AddIsIncludedToServicesAndPlanService";
import { CustomersPlanIdMatrix1747390000000 } from "./migrations/1747390000000-CustomersPlanIdMatrix";
import { AddCustomerAccountStatus1748010000000 } from "./migrations/1748010000000-AddCustomerAccountStatus";
import { AddDocumentAssignPermission1749200000000 } from "./migrations/1749200000000-AddDocumentAssignPermission";
import { SeedActivePlansServices1749210000000 } from "./migrations/1749210000000-SeedActivePlansServices";
import { SetAllSubscriptionPlansInactive1749220000000 } from "./migrations/1749220000000-SetAllSubscriptionPlansInactive";
import { SeedMatrixCatalogFromDocs1749230000000 } from "./migrations/1749230000000-SeedMatrixCatalogFromDocs";
import { AddEnquiryUser1749240000000 } from "./migrations/1749240000000-AddEnquiryUser";
import { SuppliersAndDocumentsLibraryExpand1749250000000 } from "./migrations/1749250000000-SuppliersFoldersDocumentsLibraryExpand";
import { AddFoldersFolderTypeEnumAndSupplierId1749260000000 } from "./migrations/1749260000000-AddFoldersFolderTypeEnumAndSupplierId";
import { AddFoldersIsDefault1749270000000 } from "./migrations/1749270000000-AddFoldersIsDefault";
import { CreateFolderDefaultsTable1749280000000 } from "./migrations/1749280000000-CreateFolderDefaultsTable";
import { UnifyFolderDefaultsDropType1749360000000 } from "./migrations/1749360000000-UnifyFolderDefaultsDropType";
import { AllowGlobalFolderReadsForCustomerScope1749290000000 } from "./migrations/1749290000000-AllowGlobalFolderReadsForCustomerScope";
import { AccountantRoleReadOnlyFilesAndJobs1749310000000 } from "./migrations/1749310000000-AccountantRoleReadOnlyFilesAndJobs";
import { CustomersRlsPracticeStaffInsert1749320000000 } from "./migrations/1749320000000-CustomersRlsPracticeStaffInsert";
import { CustomersRlsPracticeStaffInsertRoleFallback1749330000000 } from "./migrations/1749330000000-CustomersRlsPracticeStaffInsertRoleFallback";
import { CreateUserDeviceTokensTable1749340000000 } from "./migrations/1749340000000-CreateUserDeviceTokensTable";
import { CustomerUserPortalFileReadWrite1749350000000 } from "./migrations/1749350000000-CustomerUserPortalFileReadWrite";
import { CreateNotificationsTable1749370000000 } from "./migrations/1749370000000-CreateNotificationsTable";
import { NotificationEventConfigAndInbox1749380000000 } from "./migrations/1749380000000-NotificationEventConfigAndInbox";
import { FileUploadedNotifyCustomerAdmins1749390000000 } from "./migrations/1749390000000-FileUploadedNotifyCustomerAdmins";
import { FileUploadedAudienceCustomerAdminsOnly1749400000000 } from "./migrations/1749400000000-FileUploadedAudienceCustomerAdminsOnly";
import { SoftDeleteFilesAndJobs1749410000000 } from "./migrations/1749410000000-SoftDeleteFilesAndJobs";
import { SoftDeleteDocuments1749430000000 } from "./migrations/1749430000000-SoftDeleteDocuments";
import { FileDeleteManagerAndAdminOnly1749420000000 } from "./migrations/1749420000000-FileDeleteManagerAndAdminOnly";
import { SoftDeleteFolders1749440000000 } from "./migrations/1749440000000-SoftDeleteFolders";
import { CreateRefreshTokensTable1749450000000 } from "./migrations/1749450000000-CreateRefreshTokensTable";
import { FileUploadedBatchNotificationTemplate1749460000000 } from "./migrations/1749460000000-FileUploadedBatchNotificationTemplate";
import { CreateLibraryExportJobs1749470000000 } from "./migrations/1749470000000-CreateLibraryExportJobs";
import { LibraryExportJobsNullableCustomer1749480000000 } from "./migrations/1749480000000-LibraryExportJobsNullableCustomer";
import { CreateCustomerDocumentsExportJobs1750100000000 } from "./migrations/1750100000000-CreateCustomerDocumentsExportJobs";
import { AddFoldersIsRestrictedAndFolderRestrictedTable1749490000000 } from "./migrations/1749490000000-AddFoldersIsRestrictedAndFolderRestrictedTable";
import { SoftDeleteCustomers1749500000000 } from "./migrations/1749500000000-SoftDeleteCustomers";
import { CustomerAdminPortalUserPermissions1749510000000 } from "./migrations/1749510000000-CustomerAdminPortalUserPermissions";
import { CustomerDocumentsExportJobsNullableCustomer1750110000000 } from "./migrations/1750110000000-CustomerDocumentsExportJobsNullableCustomer";
import { AddInvoiceLineItemsDescription1750120000000 } from "./migrations/1750120000000-AddInvoiceLineItemsDescription";
import { NotificationGroups1750130000000 } from "./migrations/1750130000000-NotificationGroups";
import { FileActivityLogs1750140000000 } from "./migrations/1750140000000-FileActivityLogs";
import { DeadlineCampaigns1750150000000 } from "./migrations/1750150000000-DeadlineCampaigns";
import { DeadlineCampaignUniqueDateField1750160000000 } from "./migrations/1750160000000-DeadlineCampaignUniqueDateField";
import { DeadlineCampaignScheduleFields1750170000000 } from "./migrations/1750170000000-DeadlineCampaignScheduleFields";
import { FileAssignedNotificationEvent1750180000000 } from "./migrations/1750180000000-FileAssignedNotificationEvent";
import { AddRoleTypeAndIsSystem1750190000000 } from "./migrations/1750190000000-AddRoleTypeAndIsSystem";
import { AppUserHasPermissionAndCustomersRls1750200000000 } from "./migrations/1750200000000-AppUserHasPermissionAndCustomersRls";
import { AddReportReadPermission1750210000000 } from "./migrations/1750210000000-AddReportReadPermission";
import { SeedRoleDescriptions1750220000000 } from "./migrations/1750220000000-SeedRoleDescriptions";
import { RemovePortalJobPermissions1750230000000 } from "./migrations/1750230000000-RemovePortalJobPermissions";
import { AddDocumentAssigneePermission1750240000000 } from "./migrations/1750240000000-AddDocumentAssigneePermission";
import { BackfillStaffCustomerAssignmentsAllStatuses1750250000000 } from "./migrations/1750250000000-BackfillStaffCustomerAssignmentsAllStatuses";
import { AddJobTimingColumns1750260000000 } from "./migrations/1750260000000-AddJobTimingColumns";
import { FixJobTimingBackfill1750270000000 } from "./migrations/1750270000000-FixJobTimingBackfill";
import { AddJobProcessingDurationMs1750280000000 } from "./migrations/1750280000000-AddJobProcessingDurationMs";
import { AddInvoiceStoreNameAndCustomerAddress1750290000000 } from "./migrations/1750290000000-AddInvoiceStoreNameAndCustomerAddress";

/** Shared by `app.module.ts` (TypeORM) and `scripts/migrate.ts` (CLI). Order ≠ filename sort. */
export const typeormMigrations = [
  InitSchema1730246400000,
  AddJobModelColumns1730332800000,
  AddJobCancelledStatus1730500000000,
  AddJobAiProvider1730600000000,
  AddFinancialExtractionEntities1730700000000,
  AddInvoiceStatementLineTables1730800000000,
  AiExecutionsAndPricing1730900000000,
  AddUsers1743459600000,
  AddRoles1743460200000,
  AddUserRoles1743461100000,
  AllowNullUserRoleCustomerId1743462000000,
  ApplySkippedEarlyGuardSchema1743462100000,
  SeedDefaultAdminUser1743462150000,
  AddCustomerOnboardingData1743600000000,
  CreateCustomerAppRole_1743600000000,
  GrantPgBossToCustomerApp_1743600001000,
  AddCustomerFormSubmission1743700000000,
  AddIsAdminToUsers_1733158200000,
  DropCustomerIdFromUserRoles_1733155200000,
  EnableRlsPolicies_1733159400000,
  CustomersRlsWritePolicies1743800000000,
  DummyTestMigration1743900000000,
  CustomerFormSubmissionMetadata1744000000000,
  SignatureLinkViewedStatus1744020000000,
  FormSubmissionStatusDraftCompletedOnly1744030000000,
  AddSubscriptionPlanTable1745000000000,
  SubscriptionPlanBandsAndCustomerTurnover1745100000000,
  SeedCustomerPortalRole1745200000000,
  StaffRoleAndSubscriptionPermissions1745300000000,
  AddFilesMetadata1745400000000,
  AddCustomerFoldersAndDocuments1745500000000,
  EnableRlsFoldersAndDocuments1745600000000,
  JobsReferenceDocuments1746000000000,
  AddCustomerUsers1746100000000,
  FilesAndDocumentsS3Key1746200000000,
  AddStaffCustomerAssignments1746300000000,
  AddStaffCustomerAssignmentRlsPolicies1746310000000,
  FixStaffAssignmentRlsCorrelations1746320000000,
  AddDocumentAssignees1746330000000,
  SeedManagerAccountantAndCustomerRoles1747000000000,
  EnforceFourRolesAndPermissions1747100000000,
  AddPlanPricingFeaturesUserSubscription1747200000000,
  ReplacePlanTablesWithCustomerTypePlansMatrix1747300000000,
  SeedCustomerTypesIfMissing1747310000000,
  ReplacePlanAddonsWithVatDormantColumns1747320000000,
  AddPlansIsActive1747350000000,
  PlanCustomerTypesManyToMany1747360000000,
  AddPlanServicesTables1747370000000,
  AddIsIncludedToServicesAndPlanService1747380000000,
  CustomersPlanIdMatrix1747390000000,
  AddCustomerAccountStatus1748010000000,
  AddDocumentAssignPermission1749200000000,
  SeedActivePlansServices1749210000000,
  SetAllSubscriptionPlansInactive1749220000000,
  SeedMatrixCatalogFromDocs1749230000000,
  AddEnquiryUser1749240000000,
  SuppliersAndDocumentsLibraryExpand1749250000000,
  AddFoldersFolderTypeEnumAndSupplierId1749260000000,
  AddFoldersIsDefault1749270000000,
  CreateFolderDefaultsTable1749280000000,
  UnifyFolderDefaultsDropType1749360000000,
  AllowGlobalFolderReadsForCustomerScope1749290000000,
  AccountantRoleReadOnlyFilesAndJobs1749310000000,
  CustomersRlsPracticeStaffInsert1749320000000,
  CustomersRlsPracticeStaffInsertRoleFallback1749330000000,
  CreateUserDeviceTokensTable1749340000000,
  CustomerUserPortalFileReadWrite1749350000000,
  CreateNotificationsTable1749370000000,
  NotificationEventConfigAndInbox1749380000000,
  FileUploadedNotifyCustomerAdmins1749390000000,
  FileUploadedAudienceCustomerAdminsOnly1749400000000,
  SoftDeleteFilesAndJobs1749410000000,
  FileDeleteManagerAndAdminOnly1749420000000,
  SoftDeleteDocuments1749430000000,
  SoftDeleteFolders1749440000000,
  CreateRefreshTokensTable1749450000000,
  FileUploadedBatchNotificationTemplate1749460000000,
  CreateLibraryExportJobs1749470000000,
  LibraryExportJobsNullableCustomer1749480000000,
  CreateCustomerDocumentsExportJobs1750100000000,
  AddFoldersIsRestrictedAndFolderRestrictedTable1749490000000,
  SoftDeleteCustomers1749500000000,
  CustomerAdminPortalUserPermissions1749510000000,
  CustomerDocumentsExportJobsNullableCustomer1750110000000,
  AddInvoiceLineItemsDescription1750120000000,
  NotificationGroups1750130000000,
  FileActivityLogs1750140000000,
  DeadlineCampaigns1750150000000,
  DeadlineCampaignUniqueDateField1750160000000,
  DeadlineCampaignScheduleFields1750170000000,
  FileAssignedNotificationEvent1750180000000,
  AddRoleTypeAndIsSystem1750190000000,
  AppUserHasPermissionAndCustomersRls1750200000000,
  AddReportReadPermission1750210000000,
  SeedRoleDescriptions1750220000000,
  RemovePortalJobPermissions1750230000000,
  AddDocumentAssigneePermission1750240000000,
  BackfillStaffCustomerAssignmentsAllStatuses1750250000000,
  AddJobTimingColumns1750260000000,
  FixJobTimingBackfill1750270000000,
  AddJobProcessingDurationMs1750280000000,
  AddInvoiceStoreNameAndCustomerAddress1750290000000,
];
