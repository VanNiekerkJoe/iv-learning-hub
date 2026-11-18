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
    if (moduleIds.length === 0) return { profile, modules: [], progress: [] };

    const [moduleResult, contentResult, progressResult] = await Promise.all([
      context.supabase
        .from("modules")
        .select("id, title, description, position")
        .in("id", moduleIds)
        .order("position"),
      context.supabase
        .from("content_items")
        .select("id, module_id, type, title, description, position, storage_path")
        .in("module_id", moduleIds)
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .order("position"),
      context.supabase
        .from("progress")
        .select("content_id, status, position_seconds, updated_at")
        .eq("student_id", context.userId),
    ]);

    for (const result of [moduleResult, contentResult, progressResult]) {
      if (result.error) throw new Error("Your learning dashboard could not be loaded.");
    }
    return {
      profile,
      modules: moduleResult.data ?? [],
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
    const [moduleResult, contentResult, progressResult] = await Promise.all([
      context.supabase
        .from("modules")
        .select("id, title, description, position")
        .eq("id", data.moduleId)
        .maybeSingle(),
      context.supabase
        .from("content_items")
        .select("id, module_id, type, title, description, position, storage_path")
        .eq("module_id", data.moduleId)
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .order("position"),
      context.supabase
        .from("progress")
        .select("content_id, status, position_seconds, updated_at")
        .eq("student_id", context.userId),
    ]);
    if (moduleResult.error || !moduleResult.data || contentResult.error || progressResult.error) {
      throw new Error("This course could not be loaded.");
    }
    return {
      profile,
      module: moduleResult.data,
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
          "id, module_id, type, title, description, storage_path, position, is_hidden, deleted_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(400),
      context.supabase
        .from("access_logs")
        .select("id, student_id, content_id, event, ip, created_at")
        .order("created_at", { ascending: false })
        .limit(400),
    ]);
    if (profileError || moduleError || itemError || logError)
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
        (input.id !== undefined && typeof input.id !== "string")
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
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("content_items")
        .update({
          module_id: data.moduleId,
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
