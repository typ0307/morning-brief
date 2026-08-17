import LoginButtons from "@/components/login-buttons";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-2xl font-bold">모닝브리프</h1>
        <p className="mb-8 text-center text-sm text-zinc-500">
          출근길 뉴스 요약을 받아보세요
        </p>
        <LoginButtons />
      </div>
    </div>
  );
}
