function displayResults(items) {
  const container = document.getElementById("search-results");

  if (items.length === 0) {
    container.innerHTML = "<p>No results found.</p>";
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="post sticky hentry">
      <a href="${item.url}" class="post-thumb">
        <figure>
          <img alt="${item.title}" src="${item.image}" />
        </figure>
      </a>
      <header class="entry-header">
        <h2 class="entry-title">
          <a href="${item.url}">${item.title}</a>
        </h2>
      </header>
      <div class="entry-content">
        <p>${item.description}</p>
      </div>
      <footer class="entry-footer">
        <div class="entry-meta">
          <span class="posted-on">
            <a href="${item.url}">${item.date || "Unknown date"}</a>
          </span>
          <span class="byline"> by <span class="author vcard">
              <a href="#">${item.author || "Anonymous"}</a>
            </span>
          </span>
          <small>.</small>
          <span class="cat-links">Posted in "<a href="#">${item.categories?.[0] || "Uncategorized"}</a>"</span>
        </div>
      </footer>
      <a class="btn btn-medium read-more" href="${item.url}">Read More <i class="lnr lnr-arrow-right"></i></a>
    </article>
  `).join('');
}
displayResults(data);
  