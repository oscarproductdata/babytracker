"use client";
export default function AuthError() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",fontFamily:"-apple-system,sans-serif",background:"#f8f7f4",padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:"48px",marginBottom:"16px"}}>🔒</div>
      <h1 style={{fontSize:"22px",fontWeight:"700",marginBottom:"8px",color:"#1a1916"}}>Ingen åtkomst</h1>
      <p style={{fontSize:"15px",color:"#6b6860",marginBottom:"24px"}}>Ditt Google-konto har inte åtkomst till denna app.</p>
      <a href="/api/auth/signin" style={{padding:"12px 24px",background:"#2d6a4f",color:"white",borderRadius:"10px",textDecoration:"none",fontSize:"15px",fontWeight:"600"}}>Försök med ett annat konto</a>
    </div>
  );
}
