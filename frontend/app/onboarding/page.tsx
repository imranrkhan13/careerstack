"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import ProgressLine from "@/components/onboarding/ProgressLine";
import ConnectStep from "@/components/onboarding/ConnectStep";
import ResumeStep from "@/components/onboarding/ResumeStep";
import GitHubStep from "@/components/onboarding/GitHubStep";
import LinkedInStep from "@/components/onboarding/LinkedInStep";
import RevealStep from "@/components/onboarding/RevealStep";
import { api, ParsedEntities, GitHubImportResult, GraphSummary } from "@/lib/api";

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [resumeData, setResumeData] = useState<ParsedEntities | null>(null);
  const [githubResult, setGithubResult] = useState<GitHubImportResult | null>(null);
  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  async function finish(finalLinkedin: ParsedEntities | null) {
    setBuildError(null);
    try {
      const result = await api.buildGraph({
        resume: resumeData,
        linkedin: finalLinkedin,
        github_repos: githubResult?.repos ?? [],
      });
      setSummary(result);
      setStep(4);
    } catch (e: any) {
      setBuildError(e.message);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <ProgressLine step={step} total={TOTAL_STEPS} />
      <AnimatePresence mode="wait">
        {step === 0 && <ConnectStep key="connect" onContinue={() => setStep(1)} />}
        {step === 1 && (
          <ResumeStep
            key="resume"
            onContinue={(data) => {
              setResumeData(data);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <GitHubStep
            key="github"
            onContinue={(result) => {
              setGithubResult(result);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <LinkedInStep
            key="linkedin"
            onContinue={(data) => {
              finish(data);
            }}
          />
        )}
        {step === 4 && summary && <RevealStep key="reveal" summary={summary} />}
      </AnimatePresence>

      {buildError && (
        <p className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs text-gap bg-gap/10 border border-gap/20 rounded-lg px-3 py-2">
          Couldn't get everything set up: {buildError}
        </p>
      )}
    </main>
  );
}
