export function ProjectsPane() {
  return (
    <section className="page projects-page">
      <header className="page-head projects-head">
        <h2>TEAMS</h2>
        <div className="projects-head-actions">
          <button type="button" className="projects-action">
            JOIN TEAM
          </button>
        </div>
      </header>
      <div className="projects-body">
        <div className="projects-empty" role="status">
          <p>Your primary team is created automatically. Join another team from the sidebar.</p>
        </div>
      </div>
    </section>
  );
}
