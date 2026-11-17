import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  if (!profile.active) throw new Error("This account is currently inactive. Contact IV Consulting for help.");
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
        .select("id, module_id, type, title, description, position")
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
  .inputValidator((input: { moduleId: string }) => input)
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
      context.supabase.from("modules").select("id, title, description, position").eq("id", data.moduleId).maybeSingle(),
      context.supabase
        .from("content_items")
        .select("id, module_id, type, title, description, position")
        .eq("module_id", data.moduleId)
        .eq("is_hidden", false)
        .is("deleted_at", null)
        .order("position"),
      context.supabase.from("progress").select("content_id, status, position_seconds, updated_at").eq("student_id", context.userId),
    ]);
    if (moduleResult.error || !moduleResult.data || contentResult.error || progressResult.error) {
      throw new Error("This course could not be loaded.");
    }
    return { profile, module: moduleResult.data, content: contentResult.data ?? [], progress: progressResult.data ?? [] };
  });

export const getTemporaryContentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contentId: string }) => input)
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

    const ip = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const userAgent = getRequestHeader("user-agent") ?? "";
    await context.supabase.from("access_logs").insert({
      student_id: context.userId,
      content_id: content.id,
      event: "opened",
      ip,
      user_agent: userAgent.slice(0, 600),
    });

    const { data: signedFile, error: signingError } = await context.supabase.storage
      .from("iv-learning-content")
      .createSignedUrl(content.storage_path, 90);
    if (signingError || !signedFile) throw new Error("A temporary learning link could not be created.");
    return { url: signedFile.signedUrl, type: content.type, title: content.title, expiresInSeconds: 90 };
  });

export const saveLearningProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contentId: string; status: "in_progress" | "completed"; positionSeconds: number }) => {
    if (!input.contentId || !Number.isFinite(input.positionSeconds) || input.positionSeconds < 0) {
      throw new Error("Learning progress is invalid.");
    }
    return input;
  })
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
    const [{ data: profiles, error: profileError }, { data: modules, error: moduleError }, { data: items, error: itemError }, { data: logs, error: logError }] = await Promise.all([
      context.supabase.from("profiles").select("id, full_name, student_id, role, active, created_at, terms_accepted_at").order("created_at", { ascending: false }).limit(250),
      context.supabase.from("modules").select("id, title, description, position").order("position"),
      context.supabase.from("content_items").select("id, module_id, type, title, description, storage_path, position, is_hidden, deleted_at, created_at").order("created_at", { ascending: false }).limit(400),
      context.supabase.from("access_logs").select("id, student_id, content_id, event, ip, created_at").order("created_at", { ascending: false }).limit(400),
    ]);
    if (profileError || moduleError || itemError || logError) throw new Error("The administration list could not be loaded.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) throw new Error("Student contact details could not be loaded.");
    const usersById = new Map(authUsers.users.map((user) => [user.id, user.email ?? ""]));

    return {
      profiles: (profiles ?? []).map((profile) => ({ ...profile, email: usersById.get(profile.id) ?? "" })),
      modules: modules ?? [],
      items: items ?? [],
      logs: logs ?? [],
    };
  });

export const invitePortalStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; fullName: string; studentId: string; moduleIds: string[] }) => {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    const studentId = input.studentId.trim();
    if (!email.includes("@") || !fullName || !studentId || input.moduleIds.length > 6) {
      throw new Error("Add a name, student ID, valid email, and up to six course assignments.");
    }
    return { email, fullName, studentId, moduleIds: input.moduleIds };
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invitation, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName },
    });
    if (error || !invitation.user) throw new Error("The student invitation could not be sent.");
    const studentUuid = invitation.user.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: studentUuid,
      full_name: data.fullName,
      student_id: data.studentId,
      role: "student",
      active: true,
    });
    if (profileError) throw new Error("The invitation was sent, but the student details could not be saved.");
    const { error: roleError } = await supabaseAdmin.from("user_roles").upsert({ user_id: studentUuid, role: "student" }, { onConflict: "user_id,role" });
    if (roleError) throw new Error("The invitation was sent, but course access could not be prepared.");
    if (data.moduleIds.length) {
      const { error: assignmentError } = await supabaseAdmin.from("student_modules").upsert(
        data.moduleIds.map((moduleId) => ({ student_id: studentUuid, module_id: moduleId })),
        { onConflict: "student_id,module_id" },
      );
      if (assignmentError) throw new Error("The invitation was sent, but course assignments could not be saved.");
    }
    return { invited: true };
  });

export const updateStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string; fullName: string; role: "student" | "admin"; active: boolean; moduleIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    if (data.moduleIds.length > 6) throw new Error("A student can be assigned up to six courses.");
    const { error: updateError } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName.trim(), role: data.role, active: data.active })
      .eq("id", data.studentId);
    if (updateError) throw new Error("Student details could not be updated.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: clearError } = await supabaseAdmin.from("student_modules").delete().eq("student_id", data.studentId);
    if (clearError) throw new Error("Course assignments could not be refreshed.");
    if (data.moduleIds.length) {
      const { error: assignmentError } = await supabaseAdmin.from("student_modules").insert(
        data.moduleIds.map((moduleId) => ({ student_id: data.studentId, module_id: moduleId })),
      );
      if (assignmentError) throw new Error("Course assignments could not be saved.");
    }
    return { saved: true };
  });

export const savePortalContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    moduleId: string;
    type: "pdf" | "video" | "audio";
    title: string;
    description: string;
    storagePath: string;
    publish: boolean;
  }) => {
    if (!input.title.trim() || !input.moduleId || !input.storagePath.startsWith(`${input.moduleId}/`)) {
      throw new Error("Choose a course and a title before saving this item.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    if (data.id) {
      const { error } = await context.supabase.from("content_items").update({
        module_id: data.moduleId,
        type: data.type,
        title: data.title.trim(),
        description: data.description.trim(),
        storage_path: data.storagePath,
        is_hidden: !data.publish,
      }).eq("id", data.id);
      if (error) throw new Error("This learning item could not be updated.");
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
  .inputValidator((input: { id: string; action: "hide" | "publish" | "delete" | "restore" }) => input)
  .handler(async ({ data, context }) => {
    await requireAdministrator(context.userId, context.supabase as PortalDb);
    let update: Database["public"]["Tables"]["content_items"]["Update"];
    if (data.action === "delete") update = { deleted_at: new Date().toISOString(), is_hidden: true };
    else if (data.action === "restore") update = { deleted_at: null, is_hidden: true };
    else update = { is_hidden: data.action === "hide" };
    const { error } = await context.supabase.from("content_items").update(update).eq("id", data.id);
    if (error) throw new Error("This learning item could not be changed.");
    return { saved: true };
  });