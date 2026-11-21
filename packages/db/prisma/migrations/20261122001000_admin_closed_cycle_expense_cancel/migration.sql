-- Permit audited cancellation of a single posted historical expense.
-- Keep period boundaries, closing snapshots, and physical records immutable.
CREATE OR REPLACE FUNCTION finance_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; org uuid; day date; linked boolean; admin_expense_edit boolean := false; admin_expense_cancel boolean := false; zero_personal_opening boolean := false;
BEGIN
 -- Only the API's authorized, transaction-local correction for this exact
 -- transaction can bypass the historical date guard. All other checks remain.
 IF TG_TABLE_NAME='FinancialTransaction' AND TG_OP='UPDATE' THEN
  admin_expense_edit := coalesce(current_setting('digimarket.closed_expense_edit',true),'') =
    (to_jsonb(OLD)->>'organizationId')||':'||(to_jsonb(OLD)->>'id')
    AND to_jsonb(OLD)->>'kind'='EXPENSE' AND to_jsonb(OLD)->>'status'='POSTED'
    AND (to_jsonb(OLD)-ARRAY['amount','categoryId','occurredOn','method','merchantOrSource','description','clientId','enteredById','moneyAccountId','updatedAt'])
       = (to_jsonb(NEW)-ARRAY['amount','categoryId','occurredOn','method','merchantOrSource','description','clientId','enteredById','moneyAccountId','updatedAt'])
    AND EXISTS(SELECT 1 FROM "FinancePeriodClose" c
      WHERE c."organizationId"=(to_jsonb(OLD)->>'organizationId')::uuid
      AND (to_jsonb(OLD)->>'occurredOn')::date BETWEEN c."from" AND c."to"
      AND (to_jsonb(NEW)->>'occurredOn')::date BETWEEN c."from" AND c."to");
  admin_expense_cancel := coalesce(current_setting('digimarket.closed_expense_cancel',true),'') =
    (to_jsonb(OLD)->>'organizationId')||':'||(to_jsonb(OLD)->>'id')
    AND to_jsonb(OLD)->>'kind'='EXPENSE' AND to_jsonb(OLD)->>'status'='POSTED'
    AND to_jsonb(NEW)->>'status'='CANCELLED' AND to_jsonb(NEW)->>'postedAt' IS NULL
    AND (to_jsonb(OLD)-ARRAY['status','postedAt','updatedAt'])
       = (to_jsonb(NEW)-ARRAY['status','postedAt','updatedAt'])
    AND EXISTS(SELECT 1 FROM "FinancePeriodClose" c
      WHERE c."organizationId"=(to_jsonb(OLD)->>'organizationId')::uuid
      AND (to_jsonb(OLD)->>'occurredOn')::date BETWEEN c."from" AND c."to");
 END IF;
 -- An assigned user may need an internal zero-balance clearing account.
 -- Allow only the exact server-authorized zero opening, not a bank balance rewrite.
 IF TG_TABLE_NAME='MoneyAccount' AND TG_OP='INSERT' THEN
  row_data=to_jsonb(NEW);
  zero_personal_opening := coalesce(current_setting('digimarket.closed_expense_assignee',true),'') =
    (row_data->>'organizationId')||':'||(row_data->>'ownerUserId')
    AND row_data->>'normalizedName'='personal-clearing-'||(row_data->>'ownerUserId')
    AND row_data->>'kind'='CASH' AND (row_data->>'openingBalance')::numeric=0
    AND row_data->>'createdById'=row_data->>'ownerUserId';
 END IF;
 IF TG_OP<>'INSERT' THEN
  row_data=to_jsonb(OLD);
  IF TG_TABLE_NAME='SalaryFundingAllocation' THEN
   SELECT "organizationId","paidOn" INTO org,day FROM "SalaryPayment" WHERE "id"=(row_data->>'paymentId')::uuid;
  ELSE org=(row_data->>'organizationId')::uuid;day=(row_data->>TG_ARGV[0])::date; END IF;
  IF NOT coalesce(admin_expense_edit,false) AND NOT coalesce(admin_expense_cancel,false) AND NOT coalesce(zero_personal_opening,false) THEN PERFORM finance_assert_open(org,day); END IF;
  IF TG_TABLE_NAME IN ('FinancialTransaction','SalaryPayment','ClientFundEntry','MoneyTransfer') THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "reversesId"=$1)',TG_TABLE_NAME) INTO linked USING (row_data->>'id')::uuid;
   IF row_data->>'reversesId' IS NOT NULL OR linked THEN RAISE EXCEPTION 'FINANCE_REVERSED: reversed records are immutable'; END IF;
  ELSIF TG_TABLE_NAME='SalaryFundingAllocation' THEN
   IF EXISTS(SELECT 1 FROM "SalaryPayment" p WHERE (p."id"=(row_data->>'paymentId')::uuid AND p."reversesId" IS NOT NULL) OR p."reversesId"=(row_data->>'paymentId')::uuid) THEN RAISE EXCEPTION 'FINANCE_REVERSED: reversed salary allocations are immutable'; END IF;
  END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  row_data=to_jsonb(NEW);
  IF TG_TABLE_NAME='SalaryFundingAllocation' THEN
   SELECT "organizationId","paidOn" INTO org,day FROM "SalaryPayment" WHERE "id"=(row_data->>'paymentId')::uuid;
  ELSE org=(row_data->>'organizationId')::uuid;day=(row_data->>TG_ARGV[0])::date; END IF;
  IF NOT coalesce(admin_expense_edit,false) AND NOT coalesce(admin_expense_cancel,false) AND NOT coalesce(zero_personal_opening,false) THEN PERFORM finance_assert_open(org,day); END IF;
  IF TG_TABLE_NAME='SalaryFundingAllocation' AND NOT EXISTS(SELECT 1 FROM "SalaryPayment" p WHERE p."id"=(row_data->>'paymentId')::uuid AND sign(p."amount")=sign((row_data->>'amount')::numeric)) THEN
   RAISE EXCEPTION 'FINANCE_ACCOUNT_SCOPE: salary allocation sign must match its payment';
  END IF;
  IF row_data->>'moneyAccountId' IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM "MoneyAccount" WHERE "id"=(row_data->>'moneyAccountId')::uuid AND "organizationId"=org AND "openingOn"<=day) THEN RAISE EXCEPTION 'FINANCE_ACCOUNT_SCOPE: account organization or opening date mismatch'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
