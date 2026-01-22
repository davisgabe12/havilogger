"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const stepsTotal = 4;

const stepContent = {
  1: {
    title: "Create your account",
    description: "A few essentials to get you started.",
  },
  2: {
    title: "Family details",
    description: "Share a little about your family and add a child profile.",
  },
  3: {
    title: "Care team",
    description: "Invite caregivers or clinicians. You can always add more later.",
  },
} as const;

type CareTeamEntry = {
  name: string;
  role: string;
  email: string;
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [includeChild, setIncludeChild] = useState(true);
  const [careTeam, setCareTeam] = useState<CareTeamEntry[]>([
    { name: "", role: "", email: "" },
  ]);

  const progressValue = useMemo(() => (step / stepsTotal) * 100, [step]);

  const activeCopy = stepContent[step];

  const handleAddCareTeam = () => {
    setCareTeam((prev) =>
      prev.length >= 5 ? prev : [...prev, { name: "", role: "", email: "" }]
    );
  };

  const handleCareTeamChange = (
    index: number,
    field: keyof CareTeamEntry,
    value: string
  ) => {
    setCareTeam((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleRemoveCareTeam = (index: number) => {
    setCareTeam((prev) => prev.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Step {step} of {stepsTotal}
        </p>
        <ProgressBar value={progressValue} />
      </header>

      <Card className="bg-card">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{activeCopy.title}</CardTitle>
          <CardDescription>{activeCopy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-foreground">
                First name
                <input className="havi-input" placeholder="Alex" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                Last name
                <input className="havi-input" placeholder="Johnson" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                Email
                <input className="havi-input" placeholder="alex@family.com" />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                Password
                <input
                  className="havi-input"
                  placeholder="Create a password"
                  type="password"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Minimum 8 characters.
                </span>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
                Phone (optional)
                <input className="havi-input" placeholder="(555) 555-5555" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Family name
                  <input className="havi-input" placeholder="Johnson family" />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  Timezone
                  <input className="havi-input" placeholder="Pacific Time (US)" />
                </label>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Add a child profile
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You can skip this for now and add children later.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      checked={includeChild}
                      className="h-4 w-4"
                      onChange={(event) => setIncludeChild(event.target.checked)}
                      type="checkbox"
                    />
                    Include child
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    Child name
                    <input
                      className="havi-input"
                      disabled={!includeChild}
                      placeholder={
                        includeChild ? "Avery" : "No child added yet"
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    Birthday
                    <input
                      className="havi-input"
                      disabled={!includeChild}
                      placeholder="MM / DD / YYYY"
                      type="text"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    Pronouns
                    <input
                      className="havi-input"
                      disabled={!includeChild}
                      placeholder="they / them"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    Notes (optional)
                    <input
                      className="havi-input"
                      disabled={!includeChild}
                      placeholder="Allergies, routines, etc."
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {careTeam.map((entry, index) => (
                <div
                  className="rounded-lg border border-border/60 bg-background/60 p-4"
                  key={`care-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Care team member {index + 1}
                    </p>
                    {careTeam.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveCareTeam(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      Name
                      <input
                        className="havi-input"
                        placeholder="Dr. Maya Lee"
                        value={entry.name}
                        onChange={(event) =>
                          handleCareTeamChange(index, "name", event.target.value)
                        }
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      Role
                      <input
                        className="havi-input"
                        placeholder="Pediatrician"
                        value={entry.role}
                        onChange={(event) =>
                          handleCareTeamChange(index, "role", event.target.value)
                        }
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-foreground">
                      Email
                      <input
                        className="havi-input"
                        placeholder="maya@clinic.com"
                        value={entry.email}
                        onChange={(event) =>
                          handleCareTeamChange(index, "email", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Add up to five care team members. You can always edit this later.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddCareTeam}
                  disabled={careTeam.length >= 5}
                >
                  Add another
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((prev) => (prev === 1 ? prev : (prev - 1) as 1 | 2 | 3))}
            disabled={step === 1}
          >
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            {step === 3 ? (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/activate">Skip for now</Link>
                </Button>
                <Button asChild>
                  <Link href="/activate">Finish setup</Link>
                </Button>
              </>
            ) : (
              <Button onClick={() => setStep((prev) => (prev + 1) as 1 | 2 | 3)}>
                Continue
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
