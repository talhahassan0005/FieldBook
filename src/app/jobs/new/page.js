import Breadcrumbs from "@/components/Breadcrumbs";
import BackButton from "@/components/BackButton";
import JobForm from "@/components/JobForm";

export default function NewJobPage() {
  return (
    <div>
      <BackButton href="/" label="Back to jobs" />
      <Breadcrumbs items={[{ label: "Jobs", href: "/" }, { label: "New job" }]} />
      <h1 className="mb-6 text-2xl font-bold text-slate-900">New survey job</h1>
      <JobForm />
    </div>
  );
}
