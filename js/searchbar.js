let data = [];
let currentPage = 1;
const resultsPerPage = 5;
let currentResults = [];

const container = document.getElementById('search-results');
const paginationDiv = document.getElementById('pagination');

async function loadData() {
  try {
    const res = await fetch('js/pagesdata.json'); // ← your JSON path here
    data = await res.json();
    currentResults = data; // show all results initially
    displayResults(currentResults);
  } catch (err) {
    container.innerHTML = '<p>Error loading data.</p>';
    console.error(err);
  }
}

function displayResults(results) {
  currentResults = results;
  const totalPages = Math.ceil(results.length / resultsPerPage);
  const start = (currentPage - 1) * resultsPerPage;
  const end = start + resultsPerPage;
  const paginated = results.slice(start, end);

  container.innerHTML = paginated.map(item => `
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

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pagination = document.querySelector('.pagination');
  if (!pagination) return;

  // Clear existing content
  pagination.innerHTML = '';

  // Show nothing if 1 or 0 pages
  if (totalPages <= 1) return;

  // Create page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      pagination.innerHTML += `<span class="page-numbers current">${i}</span>`;
    } else {
      pagination.innerHTML += `<a href="#" class="page-numbers" data-page="${i}">${i}</a>`;
    }
  }

  // Optional: Next button
  if (currentPage < totalPages) {
    pagination.innerHTML += `<a href="#" class="next page-numbers" data-page="${currentPage + 1}"><i class="fa fa-angle-right"></i></a>`;
  }

  // Add click event listeners to all pagination links
  const pageLinks = pagination.querySelectorAll('.page-numbers[data-page]');
  pageLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const page = parseInt(this.getAttribute('data-page'));
      changePage(page);
    });
  });
}


function changePage(page) {
  currentPage = page;
  displayResults(currentResults);
}

// Handle search
const form = document.querySelector('.search-form');
form.addEventListener('submit', function (e) {
  e.preventDefault();
  const query = form.querySelector('.search-field').value.toLowerCase();
  const filtered = data.filter(item =>
    item.title.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query) ||
    item.categories.join(', ').toLowerCase().includes(query)
  );
  currentPage = 1;
  displayResults(filtered);
});

// Load on page start
loadData();
