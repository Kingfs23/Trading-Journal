(function () {
  const page = location.pathname.split("/").pop() || "index.html";
  const items = [
    ["index.html", "Overview", "⌂"],
    ["journal.html", "Journal", "＋"],
    ["history.html", "History", "◫"],
    ["monthly.html", "Monthly", "▦"],
    ["pairs.html", "Pairs", "◇"],
  ];
  const sidebar = document.createElement("aside");
  sidebar.className = "terminalSidebar";
  sidebar.id = "terminalSidebar";
  sidebar.innerHTML = `
    <a class="terminalBrand" href="index.html"><span class="brandMark">K</span><span><b>King<span>FX</span></b><small>Trade Journal</small></span></a>
    <span class="navLabel">WORKSPACE</span>
    <nav class="sideNav">${items.map(([href,label,icon])=>`<a href="${href}" class="${page===href?"active":""}"><i>${icon}</i><span>${label}</span></a>`).join("")}</nav>
    <span class="navLabel navLabelBottom">SYSTEM</span>
    <div class="sideStatus"><i></i><span><b>Cloud journal</b><small>Supabase connected</small></span></div>
    <div class="traderCard"><span class="traderAvatar">K</span><span><b>KingFX</b><small>Performance workspace</small></span></div>`;
  document.body.prepend(sidebar);
  document.body.classList.add("terminalApp");
  const header = document.querySelector(".topbar");
  if (header) {
    const menu = document.createElement("button");
    menu.className = "mobileMenu"; menu.type = "button"; menu.setAttribute("aria-label","Toggle navigation"); menu.textContent = "☰";
    header.prepend(menu);
    menu.addEventListener("click",()=>sidebar.classList.toggle("open"));
  }
  document.addEventListener("click",event=>{if(innerWidth<=760&&!sidebar.contains(event.target)&&!event.target.closest(".mobileMenu"))sidebar.classList.remove("open")});
})();
