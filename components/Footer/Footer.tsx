import Logo from "@/components/Logo/Logo";

export default function Footer() {
  return (
    <div className="bottom">
      <div className="left">
        <p className="soon">COMING SOON</p>
      </div>
      <div className="right">
        <Logo />
        <div className="copy">&copy; ethze 2026</div>
      </div>
    </div>
  );
}
