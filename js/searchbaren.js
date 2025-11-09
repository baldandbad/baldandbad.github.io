// searchbar.js — corrected + better error messages + fallback sample
let data = [];
let currentPage = 1;
const resultsPerPage = 5;
let currentResults = [];

// IMPORTANT: these were missing in your posted script and will cause populateCategories() to throw
let selectedCategory = 'all';
const categoryListEl = document.getElementById('categoryList');

const container = document.getElementById('search-results');
const paginationDiv = document.getElementById('pagination');

async function loadData() {
  try {
    // try different possible relative paths if needed (adjust to your setup)
    const pathCandidates = [
  '/js/pagesdataen.json',
  './js/pagesdataen.json',
  '../js/pagesdataen.json'
];
    let res = null;
    let lastErr = null;

    for (const p of pathCandidates) {
      try {
        res = await fetch(p);
        // break on 200-299
        if (res.ok) {
          // use this response
          break;
        } else {
          lastErr = new Error(`HTTP ${res.status} ${res.statusText} for ${p}`);
          res = null;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!res) throw lastErr || new Error('Could not fetch pagesdata.json');

    // try to parse JSON and surface parse errors
    const txt = await res.text();
    try {
      data = JSON.parse(txt);
    } catch (err) {
      throw new Error('pagesdata.json contains invalid JSON: ' + err.message);
    }

    // get categories (try categories.json or extract from pagesdata)
    try {
      const catRes = await fetch('/js/categoriesen.json');
      if (catRes.ok) {
        const catsObj = await catRes.json();
        populateCategories(Array.isArray(catsObj) ? catsObj : extractCategoriesFromData(data));
      } else {
        populateCategories(extractCategoriesFromData(data));
      }
    } catch (err) {
      populateCategories(extractCategoriesFromData(data));
    }

    currentResults = data;
    displayResults(currentResults);

  } catch (err) {
    console.error('Failed to load data:', err);
    if (container) container.innerHTML = `<p>Error loading data: ${err.message}</p>`;

    // fallback to sample data so UI remains functional while you fix file/path
    data = SAMPLE_DATA;
    populateCategories(extractCategoriesFromData(data));
    currentResults = data;
    displayResults(currentResults);
  }
}

function populateCategories(categories) {
  if (!categoryListEl) return;
  const allItem = `<li data-cat="all" class="${selectedCategory==='all' ? 'active' : ''}">All</li>`;
  const rest = categories.map(c => `<li data-cat="${c}">${c}</li>`).join('');
  categoryListEl.innerHTML = allItem + rest;

  categoryListEl.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const cat = li.getAttribute('data-cat');
      selectedCategory = cat || 'all';
      categoryListEl.querySelectorAll('li').forEach(x => x.classList.remove('active'));
      li.classList.add('active');
      currentPage = 1;
      applyFilters();
    });
  });
}

function applyFilters() {
  const searchField = document.querySelector('.search-field') || document.getElementById('searchInput');
  const queryRaw = searchField ? (searchField.value || '').toLowerCase() : '';
  const query = removeAccents(queryRaw);

  const filtered = data.filter(item => {
    const matchesCategory = selectedCategory === 'all' || (item.categories && item.categories.includes(selectedCategory));
    const title = removeAccents((item.title || '').toLowerCase());
    const desc = removeAccents((item.description || '').toLowerCase());
    const cats = removeAccents((Array.isArray(item.categories) ? item.categories.join(', ') : '').toLowerCase());
    const matchesQuery = query === '' || title.includes(query) || desc.includes(query) || cats.includes(query);
    return matchesCategory && matchesQuery;
  });

  currentResults = filtered;
  displayResults(filtered);
}

function displayResults(results) {
  currentResults = results;
  const totalPages = Math.ceil(results.length / resultsPerPage);
  const start = (currentPage - 1) * resultsPerPage;
  const end = start + resultsPerPage;
  const paginated = results.slice(start, end);

  if (!container) return;
  container.innerHTML = paginated.map(item => `
    <article class="post sticky hentry">
      <a href="${item.url}" class="post-thumb">
        <figure><img src="${item.image || 'images/placeholder.png'}" alt="${item.title}"></figure>
      </a>
      <header class="entry-header">
        <h2 class="entry-title"><a href="${item.url}">${item.title}</a></h2>
      </header>
      <div class="entry-content"><p>${item.description || ''}</p></div>
      <a class="btn btn-medium read-more" href="${item.url}">Learn more <i class="lnr lnr-arrow-right"></i></a>
    </article>
  `).join('');

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pagination = document.querySelector('.pagination');
  if (!pagination) return;
  pagination.innerHTML = '';
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      pagination.innerHTML += `<span class="page-numbers current">${i}</span>`;
    } else {
      pagination.innerHTML += `<a href="#" class="page-numbers" data-page="${i}">${i}</a>`;
    }
  }
  if (currentPage < totalPages) {
    pagination.innerHTML += `<a href="#" class="next page-numbers" data-page="${currentPage + 1}"><i class="fa fa-angle-right"></i></a>`;
  }

  pagination.querySelectorAll('.page-numbers[data-page]').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const page = parseInt(this.getAttribute('data-page'), 10);
      changePage(page);
    });
  });
}

function changePage(page) {
  currentPage = page;
  displayResults(currentResults);
}

// Utility: Remove Vietnamese accents
function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// single submit handler that uses applyFilters() (remove duplicates in your file)
const form = document.querySelector('.search-form') || document.getElementById('searchForm');
if (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    currentPage = 1;
    applyFilters();
  });
}

// extract categories from pagesdata
function extractCategoriesFromData(dataArr) {
  const s = new Set();
  dataArr.forEach(item => {
    if (Array.isArray(item.categories)) {
      item.categories.forEach(c => {
        if (c && c.toString().trim()) s.add(c.toString().trim());
      });
    }
  });
  return Array.from(s).sort((a,b)=> a.localeCompare(b));
}

// Start
loadData();
