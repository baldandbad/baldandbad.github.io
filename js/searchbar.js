  // Get the JSON from the <script> tag
  const rawData = document.getElementById('blog-data').textContent;
  const data = JSON.parse(rawData);

  const container = document.getElementById('search-results-container');

  function displayResults(results) {
    container.innerHTML = results.map(item => `
      <article class="post sticky hentry">
        <a href="${item.url}" class="post-thumb">
          <figure><img src="${item.image}" alt="${item.title}"></figure>
        </a>
        <header class="entry-header">
          <h2 class="entry-title"><a href="${item.url}">${item.title}</a></h2>
        </header>
        <div class="entry-content"><p>${item.description}</p></div>
        <footer class="entry-footer">
          <div class="entry-meta">
            <span class="posted-on"><a href="${item.url}">${item.date}</a></span>
            <span class="byline">by <span class="author vcard"><a href="#">${item.author}</a></span></span>
            <span class="cat-links">Posted in "<a href="#">${item.categories?.[0]}</a>"</span>
          </div>
        </footer>
        <a class="btn btn-medium read-more" href="${item.url}">Read More <i class="lnr lnr-arrow-right"></i></a>
      </article>
    `).join('');
  }

  // For demo: show all on load
  displayResults(data);

  // If using a search bar:
  const form = document.querySelector('.search-form');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const query = form.querySelector('.search-field').value.toLowerCase();
    const filtered = data.filter(item =>
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.categories.join(', ').toLowerCase().includes(query)
    );
    displayResults(filtered);
  });