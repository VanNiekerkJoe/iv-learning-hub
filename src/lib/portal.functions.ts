import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRecentlyDeleted, STARTER_MODULES } from "@/lib/learning-domain";

type PortalDb = SupabaseClient<Database>;

type PortalContext = {
  userId: string;
  claims: { email?: string };
  supabase: PortalDb;
};

type RegistrationDocumentInput = {
  name: string;
  type: string;
  size: number;
};

export type StudentRegistrationInput = {
  fullNames: string;
  surname: string;
  cellPhone: string;
  southAfricanIdNumber: string;
  passportNumber: string;
  passportCountry: string;
  gender: string;
  ethnicity: string;
  homeLanguage: string;
  fullHomeAddress: string;
  province: string;
  postalCode: string;
  email: string;
  passedGrade12: boolean;
  qualificationName: string;
  employedAtRealEstateCompany: boolean;
  realEstateCompany: string;
  paymentPlan: "once_off" | "monthly";
  declarationAccepted: boolean;
  signatureName: string;
  signatureDate: string;
  documents: {
    identity: RegistrationDocumentInput;
    education: RegistrationDocumentInput;
    payment: RegistrationDocumentInput;
  };
  website: string;
};

const REGISTRATION_BUCKET = "student-registration-documents";
const MAX_REGISTRATION_FILE_SIZE = 10 * 1024 * 1024;

function cleanRegistrationText(value: unknown, field: string, maxLength = 500) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const clean = value.trim();
  if (!clean || clean.length > maxLength) {
    throw new Error(`${field} must be between 1 and ${maxLength} characters.`);
  }
  return clean;
}

function validateRegistrationDocument(document: RegistrationDocumentInput, field: string) {
  const name = cleanRegistrationText(document?.name, `${field} file name`, 180);
  if (!["application/pdf", "image/jpeg", "image/png"].includes(document?.type)) {
    throw new Error(`${field} must be a PDF, JPG, or PNG file.`);
  }
  if (
    !Number.isFinite(document?.size) ||
    document.size <= 0 ||
    document.size > MAX_REGISTRATION_FILE_SIZE
  ) {
    throw new Error(`${field} must be smaller than 10 MB.`);
  }
  const extension = name.split(".").at(-1)?.toLowerCase();
  const expectedExtensions: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
  };
  if (!extension || !(expectedExtensions[document.type] ?? []).includes(extension)) {
    throw new Error(`${field} file type does not match its file name.`);
  }
  return { name, type: document.type, size: document.size };
}

function validateStudentRegistration(input: StudentRegistrationInput) {
  if (input.website) return null;
  const southAfricanIdNumber = String(input.southAfricanIdNumber ?? "").trim();
  const passportNumber = String(input.passportNumber ?? "").trim();
  if (!southAfricanIdNumber && !passportNumber) {
    throw new Error("Enter a South African ID number or passport number.");
  }
  if (southAfricanIdNumber && !/^\d{13}$/.test(southAfricanIdNumber)) {
    throw new Error("The South African ID number must contain 13 digits.");
  }
  if (passportNumber && !input.passportCountry?.trim()) {
    throw new Error("Enter the country that issued the passport.");
  }
  if (!input.passedGrade12) {
    throw new Error("Confirm that you passed Grade 12 before registering.");
  }
  if (
    !["once_off", "monthly"].includes(input.paymentPlan) ||
    typeof input.declarationAccepted !== "boolean" ||
    !input.declarationAccepted
  ) {
    throw new Error("Choose a payment plan and accept the registration declaration.");
  }
  if (
    typeof input.employedAtRealEstateCompany !== "boolean" ||
    (input.employedAtRealEstateCompany && !input.realEstateCompany?.trim())
  ) {
    throw new Error("Enter the real estate company where you are employed.");
  }
  const email = cleanRegistrationText(input.email, "Email address", 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const signatureDate = cleanRegistrationText(input.signatureDate, "Signature date", 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signatureDate)) throw new Error("Choose a valid signature date.");
  return {
    fullNames: cleanRegistrationText(input.fullNames, "Full names", 180),
    surname: cleanRegistrationText(input.surname, "Surname", 120),
    cellPhone: cleanRegistrationText(input.cellPhone, "Cell phone number", 40),
    southAfricanIdNumber: southAfricanIdNumber || "",
    passportNumber: passportNumber || "",
    passportCountry: String(input.passportCountry ?? "").trim(),
    gender: cleanRegistrationText(input.gender, "Gender", 50),
    ethnicity: cleanRegistrationText(input.ethnicity, "Ethnicity", 50),
    homeLanguage: cleanRegistrationText(input.homeLanguage, "Home language", 100),
    fullHomeAddress: cleanRegistrationText(input.fullHomeAddress, "Full home address", 600),
    province: cleanRegistrationText(input.province, "Province", 100),
    postalCode: cleanRegistrationText(input.postalCode, "Postal code", 20),
    email,
    passedGrade12: input.passedGrade12,
    qualificationName: cleanRegistrationText(input.qualificationName, "Qualification name", 240),
    employedAtRealEstateCompany: input.employedAtRealEstateCompany,
    realEstateCompany: String(input.realEstateCompany ?? "").trim(),
    paymentPlan: input.paymentPlan,
    declarationAccepted: true,
    signatureName: cleanRegistrationText(input.signatureName, "Signature", 240),
    signatureDate,
    documents: {
      identity: validateRegistrationDocument(input.documents?.identity, "ID or passport"),
      education: validateRegistrationDocument(input.documents?.education, "Matric document"),
      payment: validateRegistrationDocument(input.documents?.payment, "Proof of payment"),
    },
  };
}

async function hashRegistrationToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function registrationPath(registrationId: string, kind: string, fileName: string) {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "pdf";
  return `${registrationId}/${kind}.${extension}`;
}

async function requireActiveProfile(context: PortalContext) {
  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("id, full_name, student_id, role, active, terms_accepted_at")
    .eq("id", context.userId)
    .maybeSingle();

  if (error || !profile) throw new Error("Your learning account could not be found.");
  if (!profile.active)
    throw new Error("This account is currently inactive. Contact IV Consulting for help.");
  return { ...profile, email: context.claims.email ?? "" };
}

async function requireAdministrator(userId: string, supabase: PortalDb) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile || !profile.active || profile.role !== "admin") {
    throw new Error("Administrator access is required for this action.");
  }
}

export const beginStudentRegistration = createServerFn({ method: "POST" })
  .validator((input: StudentRegistrationInput) => validateStudentRegistration(input))
  .handler(async ({ data }) => {
    if (!data) return { ignored: true as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const registrationId = crypto.randomUUID();
    const submissionToken = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await hashRegistrationToken(submissionToken);
    const paths = {
      identity: await registrationPath(
        registrationId,
        "identity-document",
        data.documents.identity.name,
      ),
      education: await registrationPath(
        registrationId,
        "education-document",
        data.documents.education.name,
      ),
      payment: await registrationPath(
        registrationId,
        "proof-of-payment",
        data.documents.payment.name,
      ),
    };

    const { error: insertError } = await supabaseAdmin.from("student_registrations").insert({
      id: registrationId,
      submission_token_hash: tokenHash,
      full_names: data.fullNames,
      surname: data.surname,
      cell_phone: data.cellPhone,
      south_african_id_number: data.southAfricanIdNumber || null,
      passport_number: data.passportNumber || null,
      passport_country: data.passportCountry || null,
      gender: data.gender,
      ethnicity: data.ethnicity,
      home_language: data.homeLanguage,
      full_home_address: data.fullHomeAddress,
      province: data.province,
      postal_code: data.postalCode,
      email: data.email,
      passed_grade_12: data.passedGrade12,
      qualification_name: data.qualificationName,
      employed_at_real_estate_company: data.employedAtRealEstateCompany,
      real_estate_company: data.employedAtRealEstateCompany ? data.realEstateCompany : "",
      payment_plan: data.paymentPlan,
      id_document_path: paths.identity,
      id_document_name: data.documents.identity.name,
      education_document_path: paths.education,
      education_document_name: data.documents.education.name,
      payment_proof_path: paths.payment,
      payment_proof_name: data.documents.payment.name,
      declaration_accepted: data.declarationAccepted,
      signature_name: data.signatureName,
      signature_date: data.signatureDate,
    });
    if (insertError) throw new Error("Your registration could not be started. Please try again.");

    const uploadEntries = await Promise.all(
      (Object.entries(paths) as [keyof typeof paths, string][]).map(async ([key, path]) => {
        const { data: upload, error } = await supabaseAdmin.storage
          .from(REGISTRATION_BUCKET)
          .createSignedUploadUrl(path);
        if (error || !upload) {
          await supabaseAdmin.from("student_registrations").delete().eq("id", registrationId);
          throw new Error("Secure document uploads could not be prepared. Please try again.");
        }
        return [key, { path, token: upload.token, signedUrl: upload.signedUrl }] as const;
      }),
    );

    return {
      ignored: false as const,
      registrationId,
      submissionToken,
      uploads: Object.fromEntries(uploadEntries) as Record<
        keyof typeof paths,
        { path: string; token: string; signedUrl: string }
      >,
    };
  });

export const completeStudentRegistration = createServerFn({ method: "POST" })
  .validator((input: { registrationId: string; submissionToken: string }) => {
    if (
      typeof input.registrationId !== "string" ||
      !input.registrationId ||
      typeof input.submissionToken !== "string" ||
      !input.submissionToken
    ) {
      throw new Error("The registration upload could not be completed.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registration, error } = await supabaseAdmin
      .from("student_registrations")
      .select(
        "id, status, submission_token_hash, id_document_path, education_document_path, payment_proof_path",
      )
      .eq("id", data.registrationId)
      .maybeSingle();
    if (error || !registration || registration.status !== "draft") {
      throw new Error("This registration cannot be submitted. Start the form again.");
    }
    if (
      (await hashRegistrationToken(data.submissionToken)) !== registration.submission_token_hash
    ) {
      throw new Error("Secure registration confirmation failed. Start the form again.");
    }

    const { data: uploaded, error: listError } = await supabaseAdmin.storage
      .from(REGISTRATION_BUCKET)
      .list(data.registrationId, { limit: 10 });
    if (listError) throw new Error("Your uploaded documents could not be verified.");
    const uploadedNames = new Set((uploaded ?? []).map((file) => file.name));
    const expectedPaths = [
      registration.id_document_path,
      registration.education_document_path,
      registration.payment_proof_path,
    ];
    if (expectedPaths.some((path) => !uploadedNames.has(path.split("/").at(-1) ?? ""))) {
      throw new Error("One or more documents did not upload. Please upload all documents again.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("student_registrations")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", data.registrationId)
      .eq("status", "draft");
    if (updateError) throw new Error("Your registration could not be submitted.");
    return { submitted: true };
  });

export const listStudentRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registrations, error } = await supabaseAdmin
      .from("student_registrations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw new Error("Student registrations could not be loaded.");

    return {
      registrations: await Promise.all(
        (registrations ?? []).map(async (registration) => {
          const [identity, education, payment] = await Promise.all([
            supabaseAdmin.storage
              .from(REGISTRATION_BUCKET)
              .createSignedUrl(registration.id_document_path, 600),
            supabaseAdmin.storage
              .from(REGISTRATION_BUCKET)
              .createSignedUrl(registration.education_document_path, 600),
            supabaseAdmin.storage
              .from(REGISTRATION_BUCKET)
              .createSignedUrl(registration.payment_proof_path, 600),
          ] as const);
          return {
            ...registration,
            submission_token_hash: undefined,
            documentUrls: {
              identity: identity.data?.signedUrl ?? "",
              education: education.data?.signedUrl ?? "",
              payment: payment.data?.signedUrl ?? "",
            },
          };
        }),
      ),
    };
  });

export const reviewStudentRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { registrationId: string; action: "approve" | "reject"; notes: string }) => {
    if (
      typeof input.registrationId !== "string" ||
      !input.registrationId ||
      !["approve", "reject"].includes(input.action) ||
      typeof input.notes !== "string" ||
      input.notes.length > 2000
    ) {
      throw new Error("Choose a valid registration decision.");
    }
    return { ...input, notes: input.notes.trim() };
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registration, error: registrationError } = await supabaseAdmin
      .from("student_registrations")
      .select("*")
      .eq("id", data.registrationId)
      .maybeSingle();
    if (registrationError || !registration || registration.status !== "pending") {
      throw new Error("This registration is no longer waiting for a decision.");
    }

    const reviewedAt = new Date().toISOString();
    if (data.action === "reject") {
      const { error } = await supabaseAdmin
        .from("student_registrations")
        .update({
          status: "rejected",
          reviewed_by: context.userId,
          reviewed_at: reviewedAt,
          review_notes: data.notes,
          updated_at: reviewedAt,
        })
        .eq("id", registration.id)
        .eq("status", "pending");
      if (error) throw new Error("The registration could not be rejected.");
      return { status: "rejected" as const };
    }

    const password = `IV!${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const { data: authUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: registration.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${registration.full_names} ${registration.surname}`.trim(),
      },
    });
    if (createUserError || !authUser.user) {
      throw new Error(
        "The student account could not be created. Check whether this email already has an account.",
      );
    }

    const studentUuid = authUser.user.id;
    const studentId = `IV-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    try {
      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: studentUuid,
        full_name: `${registration.full_names} ${registration.surname}`.trim(),
        student_id: studentId,
        role: "student",
        active: true,
      });
      if (profileError) throw new Error("The student profile could not be created.");

      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: studentUuid,
        role: "student",
      });
      if (roleError) throw new Error("Student access could not be prepared.");

      const { data: modules, error: moduleError } = await supabaseAdmin
        .from("modules")
        .select("id")
        .in(
          "title",
          STARTER_MODULES.map((module) => module.title),
        );
      if (moduleError) throw new Error("Course assignments could not be loaded.");
      if (modules?.length) {
        const { error: assignmentError } = await supabaseAdmin
          .from("student_modules")
          .insert(modules.map((module) => ({ student_id: studentUuid, module_id: module.id })));
        if (assignmentError) throw new Error("Course assignments could not be saved.");
      }

      const { error: approvalError } = await supabaseAdmin
        .from("student_registrations")
        .update({
          status: "approved",
          reviewed_by: context.userId,
          reviewed_at: reviewedAt,
          review_notes: data.notes,
          student_profile_id: studentUuid,
          updated_at: reviewedAt,
        })
        .eq("id", registration.id)
        .eq("status", "pending");
      if (approvalError) throw new Error("The approved registration could not be saved.");
    } catch (error) {
      await supabaseAdmin.from("student_modules").delete().eq("student_id", studentUuid);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", studentUuid);
      await supabaseAdmin.from("profiles").delete().eq("id", studentUuid);
      await supabaseAdmin.auth.admin.deleteUser(studentUuid);
      throw error;
    }

    return {
      status: "approved" as const,
      login: {
        name: `${registration.full_names} ${registration.surname}`.trim(),
        email: registration.email,
        studentId,
        temporaryPassword: password,
        loginPath: "/",
      },
    };
  });

export const getPortalProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => requireActiveProfile(context as PortalContext));

export const getLearningDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await requireActiveProfile(context as PortalContext);
    const { data: assigned, error: assignmentError } = await context.supabase
      .from("student_modules")
      .select("module_id")
      .eq("student_id", context.userId);
    if (assignmentError) throw new Error("Your course assignments could not be loaded.");

    const moduleIds = (assigned ?? []).map((row) => row.module_id);
    if (moduleIds.length === 0)
      return { profile, modules: [], folders: [], content: [], progress: [] };

    const [moduleResult, contentResult, folderResult, progressResult] = await Promise.all([
      context.supabase
        .from("modules")
        .select("id, title, description, position")
        .in("id", moduleIds)
        .order("position"),
      context.supabase
        .from("content_items")
        .select("id, module_id, folder_id, type, title, description, position, storage_path")
        .in("module_id", moduleIds)
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .order("position"),
      context.supabase
        .from("content_folders")
        .select("id, module_id, parent_folder_id, title, description, position, created_at")
        .in("module_id", moduleIds)
        .order("position"),
      context.supabase
        .from("progress")
        .select("content_id, status, position_seconds, updated_at")
        .eq("student_id", context.userId),
    ]);

    for (const result of [moduleResult, contentResult, folderResult, progressResult]) {
      if (result.error) throw new Error("Your learning dashboard could not be loaded.");
    }
    return {
      profile,
      modules: moduleResult.data ?? [],
      folders: folderResult.data ?? [],
      content: contentResult.data ?? [],
      progress: progressResult.data ?? [],
    };
  });

export const getLearningModule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { moduleId: string }) => input)
  .handler(async ({ data, context }) => {
    const profile = await requireActiveProfile(context as PortalContext);
    const { data: moduleAccess, error: assignmentError } = await context.supabase
      .from("student_modules")
      .select("module_id")
      .eq("student_id", context.userId)
      .eq("module_id", data.moduleId)
      .maybeSingle();
    if (profile.role !== "admin" && (assignmentError || !moduleAccess)) {
      throw new Error("This course is not assigned to your account.");
    }
    const [moduleResult, contentResult, folderResult, progressResult] = await Promise.all([
      context.supabase
        .from("modules")
        .select("id, title, description, position")
        .eq("id", data.moduleId)
        .maybeSingle(),
      context.supabase
        .from("content_items")
        .select("id, module_id, folder_id, type, title, description, position, storage_path")
        .eq("module_id", data.moduleId)
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .order("position"),
      context.supabase
        .from("content_folders")
        .select("id, module_id, parent_folder_id, title, description, position, created_at")
        .eq("module_id", data.moduleId)
        .order("position"),
      context.supabase
        .from("progress")
        .select("content_id, status, position_seconds, updated_at")
        .eq("student_id", context.userId),
    ]);
    if (
      moduleResult.error ||
      !moduleResult.data ||
      contentResult.error ||
      folderResult.error ||
      progressResult.error
    ) {
      throw new Error("This course could not be loaded.");
    }
    return {
      profile,
      module: moduleResult.data,
      folders: folderResult.data ?? [],
      content: contentResult.data ?? [],
      progress: progressResult.data ?? [],
    };
  });

export const getTemporaryContentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { contentId: string }) => input)
  .handler(async ({ data, context }) => {
    const profile = await requireActiveProfile(context as PortalContext);
    const { data: content, error } = await context.supabase
      .from("content_items")
      .select("id, module_id, type, title, storage_path, is_hidden, deleted_at")
      .eq("id", data.contentId)
      .maybeSingle();
    if (error || !content || content.deleted_at || content.is_hidden) {
      throw new Error("This learning item is not available.");
    }
    if (profile.role !== "admin") {
      const { data: assignment } = await context.supabase
        .from("student_modules")
        .select("module_id")
        .eq("student_id", context.userId)
        .eq("module_id", content.module_id)
        .maybeSingle();
      if (!assignment) throw new Error("This learning item is outside your assigned courses.");
    }

    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    const userAgent = getRequestHeader("user-agent") ?? "";
    const { error: logError } = await context.supabase.from("access_logs").insert({
      student_id: context.userId,
      content_id: content.id,
      event: "opened",
      ip,
      user_agent: userAgent.slice(0, 600),
    });
    if (logError) throw new Error("This learning activity could not be recorded.");

    const { data: signedFile, error: signingError } = await context.supabase.storage
      .from("iv-learning-content")
      .createSignedUrl(content.storage_path, 90);
    if (signingError || !signedFile)
      throw new Error("A temporary learning link could not be created.");
    return {
      url: signedFile.signedUrl,
      type: content.type,
      title: content.title,
      expiresInSeconds: 90,
    };
  });

export const saveLearningProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      contentId: string;
      status: "in_progress" | "completed";
      positionSeconds: number;
    }) => {
      if (
        !input.contentId ||
        !Number.isFinite(input.positionSeconds) ||
        input.positionSeconds < 0
      ) {
        throw new Error("Learning progress is invalid.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await requireActiveProfile(context as PortalContext);
    const { error } = await context.supabase.from("progress").upsert({
      student_id: context.userId,
      content_id: data.contentId,
      status: data.status,
      position_seconds: data.positionSeconds,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Your learning progress could not be saved.");
    return { saved: true };
  });

export const acceptCopyrightNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error("Your acceptance could not be saved.");
    return { accepted: true };
  });

export const listAdminPortalData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const [
      { data: profiles, error: profileError },
      { data: modules, error: moduleError },
      { data: items, error: itemError },
      { data: folders, error: folderError },
      { data: logs, error: logError },
    ] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("id, full_name, student_id, role, active, created_at, terms_accepted_at")
        .order("created_at", { ascending: false })
        .limit(250),
      context.supabase.from("modules").select("id, title, description, position").order("position"),
      context.supabase
        .from("content_items")
        .select(
          "id, module_id, folder_id, type, title, description, storage_path, position, is_hidden, deleted_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(400),
      context.supabase
        .from("content_folders")
        .select("id, module_id, parent_folder_id, title, description, position, created_at")
        .order("position"),
      context.supabase
        .from("access_logs")
        .select("id, student_id, content_id, event, ip, created_at")
        .order("created_at", { ascending: false })
        .limit(400),
    ]);
    if (profileError || moduleError || itemError || folderError || logError)
      throw new Error("The administration list could not be loaded.");

    const usersById = new Map<string, string>();
    if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (authError) throw new Error("Student contact details could not be loaded.");
      for (const user of authUsers.users) usersById.set(user.id, user.email ?? "");
    }

    return {
      profiles: (profiles ?? []).map((profile) => ({
        ...profile,
        email: usersById.get(profile.id) ?? "",
      })),
      modules: modules ?? [],
      folders: folders ?? [],
      items: items ?? [],
      logs: logs ?? [],
    };
  });

export const setupStarterModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const starterTitles = STARTER_MODULES.map((module) => module.title);
    const { data: existingModules, error: existingModulesError } = await supabaseAdmin
      .from("modules")
      .select("id, title")
      .in("title", starterTitles);
    if (existingModulesError) throw new Error("Existing learning modules could not be checked.");

    const existingTitles = new Set((existingModules ?? []).map((module) => module.title));
    const missingModules = STARTER_MODULES.filter((module) => !existingTitles.has(module.title));
    if (missingModules.length) {
      const { error: insertError } = await supabaseAdmin
        .from("modules")
        .insert(missingModules.map((module) => ({ ...module })));
      if (insertError) throw new Error("The starter learning modules could not be created.");
    }

    const { data: modules, error: moduleLookupError } = await supabaseAdmin
      .from("modules")
      .select("id")
      .in("title", starterTitles);
    if (moduleLookupError || !modules?.length) {
      throw new Error("The starter learning modules could not be loaded.");
    }

    const studentIds: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: students, error: studentError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "student")
        .eq("active", true)
        .order("id")
        .range(offset, offset + 999);
      if (studentError) throw new Error("Active student accounts could not be loaded.");
      studentIds.push(...(students ?? []).map((student) => student.id));
      if ((students?.length ?? 0) < 1000) break;
    }

    const assignments = studentIds.flatMap((studentId) =>
      modules.map((module) => ({ student_id: studentId, module_id: module.id })),
    );
    for (let offset = 0; offset < assignments.length; offset += 500) {
      const { error: assignmentError } = await supabaseAdmin
        .from("student_modules")
        .upsert(assignments.slice(offset, offset + 500), {
          onConflict: "student_id,module_id",
        });
      if (assignmentError) {
        throw new Error(
          "The starter modules were created, but student assignments could not be saved.",
        );
      }
    }

    return {
      addedModules: missingModules.length,
      assignedStudents: studentIds.length,
      moduleCount: modules.length,
    };
  });

export const invitePortalStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { email: string; fullName: string; studentId: string; moduleIds: string[] }) => {
      if (
        typeof input.email !== "string" ||
        typeof input.fullName !== "string" ||
        typeof input.studentId !== "string" ||
        !Array.isArray(input.moduleIds) ||
        input.moduleIds.some((moduleId) => typeof moduleId !== "string" || !moduleId)
      ) {
        throw new Error("Enter the student’s name, student ID, email, and course assignments.");
      }
      const email = input.email.trim().toLowerCase();
      const fullName = input.fullName.trim();
      const studentId = input.studentId.trim();
      if (!email.includes("@") || !fullName || !studentId) {
        throw new Error("Add a name, student ID, and valid email address.");
      }
      return { email, fullName, studentId, moduleIds: [...new Set(input.moduleIds)] };
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: existingStudent, error: studentLookupError },
      { data: modules, error: moduleError },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id").eq("student_id", data.studentId).maybeSingle(),
      data.moduleIds.length
        ? context.supabase.from("modules").select("id").in("id", data.moduleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (studentLookupError || moduleError) {
      throw new Error("Student details could not be checked. Please try again.");
    }
    if (existingStudent) throw new Error("That student ID is already in use.");
    if (modules?.length !== data.moduleIds.length) {
      throw new Error(
        "One or more selected course folders no longer exist. Refresh and try again.",
      );
    }
    const { data: invitation, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: { full_name: data.fullName },
      },
    );
    if (error || !invitation.user) throw new Error("The student invitation could not be sent.");
    const studentUuid = invitation.user.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: studentUuid,
      full_name: data.fullName,
      student_id: data.studentId,
      role: "student",
      active: true,
    });
    if (profileError)
      throw new Error("The invitation was sent, but the student details could not be saved.");
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: studentUuid, role: "student" }, { onConflict: "user_id,role" });
    if (roleError)
      throw new Error("The invitation was sent, but course access could not be prepared.");
    if (data.moduleIds.length) {
      const { error: assignmentError } = await supabaseAdmin.from("student_modules").upsert(
        data.moduleIds.map((moduleId) => ({ student_id: studentUuid, module_id: moduleId })),
        { onConflict: "student_id,module_id" },
      );
      if (assignmentError)
        throw new Error("The invitation was sent, but course assignments could not be saved.");
    }
    return { invited: true };
  });

export const updateStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      studentId: string;
      fullName: string;
      role: "student" | "admin";
      active: boolean;
      moduleIds: string[];
    }) => {
      if (
        typeof input.studentId !== "string" ||
        !input.studentId ||
        typeof input.fullName !== "string" ||
        !input.fullName.trim() ||
        (input.role !== "student" && input.role !== "admin") ||
        typeof input.active !== "boolean" ||
        !Array.isArray(input.moduleIds) ||
        input.moduleIds.some((moduleId) => typeof moduleId !== "string" || !moduleId)
      ) {
        throw new Error("Enter a valid name, account type, and course assignments.");
      }
      return {
        ...input,
        fullName: input.fullName.trim(),
        moduleIds: [...new Set(input.moduleIds)],
      };
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    if (data.role !== "admin" || !data.active) {
      const { data: activeAdministrators, error: administratorError } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("active", true);
      if (administratorError) {
        throw new Error("Administrator access could not be checked before saving.");
      }
      const targetIsActiveAdministrator = activeAdministrators?.some(
        (administrator) => administrator.id === data.studentId,
      );
      if (targetIsActiveAdministrator && (activeAdministrators?.length ?? 0) <= 1) {
        throw new Error("Keep at least one active administrator account.");
      }
    }
    const { data: existingAssignments, error: assignmentLookupError } = await context.supabase
      .from("student_modules")
      .select("module_id")
      .eq("student_id", data.studentId);
    if (assignmentLookupError) throw new Error("Existing course assignments could not be loaded.");
    const staleModuleIds = (existingAssignments ?? [])
      .map((assignment) => assignment.module_id)
      .filter((moduleId) => !data.moduleIds.includes(moduleId));

    const { data: updatedProfile, error: updateError } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName, role: data.role, active: data.active })
      .eq("id", data.studentId)
      .select("id")
      .maybeSingle();
    if (updateError || !updatedProfile) throw new Error("Student details could not be updated.");
    if (data.moduleIds.length) {
      const { error: assignmentError } = await context.supabase.from("student_modules").upsert(
        data.moduleIds.map((moduleId) => ({
          student_id: data.studentId,
          module_id: moduleId,
        })),
        { onConflict: "student_id,module_id" },
      );
      if (assignmentError) throw new Error("Course assignments could not be saved.");
    }
    if (staleModuleIds.length) {
      const { error: removeError } = await context.supabase
        .from("student_modules")
        .delete()
        .eq("student_id", data.studentId)
        .in("module_id", staleModuleIds);
      if (removeError) throw new Error("Some old course assignments could not be removed.");
    }
    return { saved: true };
  });

export const savePortalFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id?: string;
      moduleId: string;
      parentFolderId?: string | null;
      title: string;
      description: string;
    }) => {
      if (
        typeof input.moduleId !== "string" ||
        (input.id !== undefined && typeof input.id !== "string") ||
        (input.parentFolderId !== undefined &&
          input.parentFolderId !== null &&
          typeof input.parentFolderId !== "string") ||
        typeof input.title !== "string" ||
        typeof input.description !== "string"
      ) {
        throw new Error("Enter a folder name and description.");
      }
      const title = input.title.trim();
      const description = input.description.trim();
      if (!input.moduleId || !title || title.length > 100 || description.length > 500) {
        throw new Error(
          "Add a folder name up to 100 characters and a description up to 500 characters.",
        );
      }
      return { ...input, title, description, parentFolderId: input.parentFolderId ?? null };
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    if (data.parentFolderId) {
      const { data: parent, error: parentError } = await context.supabase
        .from("content_folders")
        .select("id, module_id")
        .eq("id", data.parentFolderId)
        .maybeSingle();
      if (parentError || !parent || parent.module_id !== data.moduleId) {
        throw new Error("The selected parent folder is invalid.");
      }
      if (data.id === data.parentFolderId) {
        throw new Error("A folder cannot contain itself.");
      }
    }
    let siblingQuery = context.supabase
      .from("content_folders")
      .select("id, title")
      .eq("module_id", data.moduleId);
    siblingQuery = data.parentFolderId
      ? siblingQuery.eq("parent_folder_id", data.parentFolderId)
      : siblingQuery.is("parent_folder_id", null);
    const { data: siblings, error: siblingError } = await siblingQuery;
    if (siblingError) throw new Error("Existing folders could not be checked.");
    if (
      siblings?.some(
        (folder) =>
          folder.id !== data.id && folder.title.trim().toLowerCase() === data.title.toLowerCase(),
      )
    ) {
      throw new Error("A folder with that name already exists here.");
    }

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("content_folders")
        .update({
          module_id: data.moduleId,
          parent_folder_id: data.parentFolderId,
          title: data.title,
          description: data.description,
        })
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error || !updated) throw new Error("This folder could not be updated.");
      return { id: updated.id, saved: true };
    }

    const position = siblings?.length ?? 0;
    const { data: inserted, error } = await context.supabase
      .from("content_folders")
      .insert({
        module_id: data.moduleId,
        parent_folder_id: data.parentFolderId,
        title: data.title,
        description: data.description,
        position,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("This folder could not be created.");
    return { id: inserted.id, saved: true };
  });

export const deletePortalFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (typeof input.id !== "string" || !input.id) throw new Error("Choose a folder to delete.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const [{ data: children, error: childError }, { data: items, error: itemError }] =
      await Promise.all([
        context.supabase.from("content_folders").select("id").eq("parent_folder_id", data.id),
        context.supabase.from("content_items").select("id").eq("folder_id", data.id).limit(1),
      ]);
    if (childError || itemError)
      throw new Error("This folder could not be checked before deleting.");
    if (children?.length || items?.length) {
      throw new Error("This folder must be empty before it can be deleted.");
    }
    const { data: deleted, error } = await context.supabase
      .from("content_folders")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error || !deleted) throw new Error("This folder could not be deleted.");
    return { deleted: true };
  });

export const savePortalModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id?: string; title: string; description: string }) => {
    if (
      typeof input.title !== "string" ||
      typeof input.description !== "string" ||
      (input.id !== undefined && typeof input.id !== "string")
    ) {
      throw new Error("Enter a folder name and description.");
    }
    const title = input.title.trim();
    const description = input.description.trim();
    if (!title || title.length > 100 || description.length > 500) {
      throw new Error(
        "Add a module name up to 100 characters and a description up to 500 characters.",
      );
    }
    return { ...input, title, description };
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { data: modules, error: listError } = await context.supabase
      .from("modules")
      .select("id, title, position");
    if (listError) throw new Error("Course folders could not be checked.");
    if (
      modules?.some(
        (module) =>
          module.id !== data.id && module.title.trim().toLowerCase() === data.title.toLowerCase(),
      )
    ) {
      throw new Error("A course folder already uses that name. Choose a different name.");
    }

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("modules")
        .update({ title: data.title, description: data.description })
        .eq("id", data.id)
        .select("id")
        .maybeSingle();
      if (error || !updated) throw new Error("This course folder could not be updated.");
      return { id: updated.id, saved: true };
    }

    const position =
      data.title.toLowerCase() === "induction"
        ? 0
        : Math.max(0, ...(modules ?? []).map((module) => module.position)) + 1;
    const { data: inserted, error } = await context.supabase
      .from("modules")
      .insert({ title: data.title, description: data.description, position })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("This course folder could not be created.");
    return { id: inserted.id, saved: true };
  });

export const deletePortalModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (typeof input.id !== "string" || !input.id) {
      throw new Error("Choose a course folder to delete.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const [
      { data: module, error: moduleError },
      { data: items, error: itemError },
      { data: assignments, error: assignmentError },
    ] = await Promise.all([
      context.supabase.from("modules").select("id").eq("id", data.id).maybeSingle(),
      context.supabase.from("content_items").select("id").eq("module_id", data.id).limit(1),
      context.supabase
        .from("student_modules")
        .select("student_id")
        .eq("module_id", data.id)
        .limit(1),
    ]);
    if (moduleError || itemError || assignmentError) {
      throw new Error("This course folder could not be checked before deleting.");
    }
    if (!module) throw new Error("This course folder no longer exists. Refresh and try again.");
    if (items?.length || assignments?.length) {
      throw new Error(
        "This folder still has course content or student assignments. Delete its content and remove its student assignments first.",
      );
    }
    const { data: deleted, error } = await context.supabase
      .from("modules")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error || !deleted) throw new Error("This course folder could not be deleted.");
    return { deleted: true };
  });

export const savePortalContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id?: string;
      moduleId: string;
      folderId?: string | null;
      type: "pdf" | "video" | "audio";
      title: string;
      description: string;
      storagePath: string;
      publish: boolean;
    }) => {
      if (
        typeof input.moduleId !== "string" ||
        typeof input.type !== "string" ||
        !["pdf", "video", "audio"].includes(input.type) ||
        typeof input.title !== "string" ||
        typeof input.description !== "string" ||
        typeof input.storagePath !== "string" ||
        typeof input.publish !== "boolean" ||
        (input.id !== undefined && typeof input.id !== "string") ||
        (input.folderId !== undefined &&
          input.folderId !== null &&
          typeof input.folderId !== "string")
      ) {
        throw new Error("Check the course item details and try again.");
      }
      if (
        !input.title.trim() ||
        input.title.trim().length > 180 ||
        input.description.length > 1000 ||
        !input.moduleId ||
        !input.storagePath.startsWith(`${input.moduleId}/`)
      ) {
        throw new Error("Choose a course and a title before saving this item.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { data: module, error: moduleError } = await context.supabase
      .from("modules")
      .select("id")
      .eq("id", data.moduleId)
      .maybeSingle();
    if (moduleError || !module) {
      throw new Error("This course folder no longer exists. Refresh and try again.");
    }
    if (data.folderId) {
      const { data: folder, error: folderError } = await context.supabase
        .from("content_folders")
        .select("id, module_id")
        .eq("id", data.folderId)
        .maybeSingle();
      if (folderError || !folder || folder.module_id !== data.moduleId) {
        throw new Error("The selected content folder no longer exists.");
      }
    }
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("content_items")
        .update({
          module_id: data.moduleId,
          folder_id: data.folderId ?? null,
          type: data.type,
          title: data.title.trim(),
          description: data.description.trim(),
          storage_path: data.storagePath,
          is_hidden: !data.publish,
        })
        .eq("id", data.id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error || !updated) throw new Error("This learning item could not be updated.");
    } else {
      const { error } = await context.supabase.from("content_items").insert({
        module_id: data.moduleId,
        folder_id: data.folderId ?? null,
        type: data.type,
        title: data.title.trim(),
        description: data.description.trim(),
        storage_path: data.storagePath,
        is_hidden: !data.publish,
      });
      if (error) throw new Error("This learning item could not be saved.");
    }
    return { saved: true };
  });

export const changePortalContentState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; action: "hide" | "publish" | "delete" | "restore" }) => {
    if (
      typeof input.id !== "string" ||
      !input.id ||
      !["hide", "publish", "delete", "restore"].includes(input.action)
    ) {
      throw new Error("Choose a valid action for this course item.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { data: current, error: findError } = await context.supabase
      .from("content_items")
      .select("id, deleted_at")
      .eq("id", data.id)
      .maybeSingle();
    if (findError || !current) throw new Error("This learning item no longer exists.");
    const recentlyDeleted = current.deleted_at ? isRecentlyDeleted(current.deleted_at) : false;
    if (
      (data.action === "restore" && !recentlyDeleted) ||
      (data.action !== "restore" && data.action !== "delete" && current.deleted_at) ||
      (data.action === "delete" && current.deleted_at)
    ) {
      throw new Error("This learning item has changed. Refresh the page and try again.");
    }
    let update: Database["public"]["Tables"]["content_items"]["Update"];
    if (data.action === "delete")
      update = { deleted_at: new Date().toISOString(), is_hidden: true };
    else if (data.action === "restore") update = { deleted_at: null, is_hidden: true };
    else update = { is_hidden: data.action === "hide" };
    const { data: changed, error } = await context.supabase
      .from("content_items")
      .update(update)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error || !changed) throw new Error("This learning item could not be changed.");
    return { saved: true };
  });

export const permanentlyDeletePortalContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => {
    if (typeof input.id !== "string" || !input.id) {
      throw new Error("Choose a course item to permanently delete.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { data: item, error: itemError } = await context.supabase
      .from("content_items")
      .select("id, storage_path, deleted_at")
      .eq("id", data.id)
      .maybeSingle();
    if (itemError || !item) throw new Error("This course item no longer exists.");
    if (!item.deleted_at || isRecentlyDeleted(item.deleted_at)) {
      throw new Error(
        "Course items can only be permanently deleted after 30 days in Recently deleted.",
      );
    }

    const { error: storageError } = await context.supabase.storage
      .from("iv-learning-content")
      .remove([item.storage_path]);
    if (storageError) throw new Error("The private course file could not be removed.");

    const { data: deleted, error: deleteError } = await context.supabase
      .from("content_items")
      .delete()
      .eq("id", data.id)
      .eq("deleted_at", item.deleted_at)
      .select("id")
      .maybeSingle();
    if (deleteError || !deleted) {
      throw new Error(
        "The course record changed while deleting. Refresh and check Recently deleted.",
      );
    }
    return { deleted: true };
  });
