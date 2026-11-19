"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/auth/field";
import { useToast } from "@/components/ui/toast";
import { callApi, callApiJson } from "@/components/api-client";

interface ProfileDto {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  avatarFile: string | null;
}

/** Matches the server limits so an obviously wrong file never leaves the browser. */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function ProfileView({ initialProfile }: { initialProfile: ProfileDto }) {
  const toast = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<ProfileDto>(initialProfile);
  const [name, setName] = useState(initialProfile.name);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter your full name.");
      return;
    }

    setSavingName(true);
    const result = await callApiJson<{ profile: ProfileDto }>(
      "/api/profile",
      "PATCH",
      { name: trimmed }
    );
    setSavingName(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not update your name.");
      return;
    }

    setProfile(result.data.profile);
    setName(result.data.profile.name);
    toast.show(result.message ?? "Name updated.", "success");
    // The name shows in the header and sidebar, so refresh the shell.
    router.refresh();
  }

  async function uploadAvatar(file: File) {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Keep the image under 10 MB.");
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("avatar", file);

    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      body: form,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      profile?: ProfileDto;
      message?: string;
      error?: string;
    };
    setUploading(false);

    if (!response.ok || !payload.profile) {
      setError(payload.error ?? "Could not upload the image.");
      return;
    }

    setProfile(payload.profile);
    toast.show(payload.message ?? "Profile picture updated.", "success");
    router.refresh();
  }

  async function removeAvatar() {
    if (!window.confirm("Remove your profile picture?")) return;

    setRemoving(true);
    const result = await callApi("/api/profile/avatar", "DELETE");
    setRemoving(false);

    if (!result.ok) {
      setError(result.error ?? "Could not remove the picture.");
      return;
    }

    setProfile((previous) => ({ ...previous, avatarFile: null }));
    toast.show("Profile picture removed.", "success");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Update how your name and picture appear across the app.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile picture</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar
            name={profile.name}
            avatarFile={profile.avatarFile}
            size="lg"
            className="h-20 w-20 text-xl"
          />

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  // Allow choosing the same file again after a failed attempt.
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || removing}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                {uploading ? "Uploading..." : "Upload picture"}
              </Button>

              {profile.avatarFile ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void removeAvatar()}
                  disabled={uploading || removing}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {removing ? "Removing..." : "Remove"}
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              JPG, PNG or WebP, up to 10 MB. The image is resized on the server
              to a small square, so you can upload a normal photo.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="space-y-3">
            <Field
              id="profile-name"
              label="Full name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              disabled={savingName}
              required
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">
                  {profile.email}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Position</p>
                <p className="text-sm text-muted-foreground">
                  {profile.position} &middot; {profile.department}
                </p>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Email, department, position and role are managed by an
              administrator.
            </p>

            <Button
              type="submit"
              disabled={savingName || name.trim() === profile.name}
            >
              {savingName ? "Saving..." : "Save name"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
