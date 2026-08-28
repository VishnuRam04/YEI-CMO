import { connection } from "next/server";
import { BrandOnboardingForm } from "@/components/onboarding/brand-onboarding-form";
import { getActiveBrandMemory } from "@/lib/brand-memory";

export default async function OnboardPage() {
  await connection();
  const activeBrand = await getActiveBrandMemory();

  return (
    <div className="onboard-experience-page">
      <BrandOnboardingForm
        initialBrand={activeBrand ? {
          id: activeBrand.id,
          name: activeBrand.name,
          url: activeBrand.url,
        } : null}
      />
    </div>
  );
}
