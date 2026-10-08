import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import api from '../api/axios';
import usePagedList from './usePagedList';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));

const page = (n, count = 45) => ({ data: { count, results: [{ id: n }] } });

describe('usePagedList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('يجلب الصفحة المطلوبة بحجمها، ويعود للأولى عند تغيير البحث', async () => {
    api.get.mockImplementation((path, { params }) => Promise.resolve(page(params.page)));
    const { result, rerender } = renderHook(({ search }) => usePagedList('suppliers/', {
      pageSize: 20, params: { search },
    }), { initialProps: { search: '' } });

    await waitFor(() => expect(result.current.items).toEqual([{ id: 1 }]));
    expect(result.current.count).toBe(45);
    expect(api.get).toHaveBeenLastCalledWith('suppliers/', { params: { page: 1, page_size: 20 } });

    act(() => result.current.setPage(3));
    await waitFor(() => expect(result.current.items).toEqual([{ id: 3 }]));

    rerender({ search: 'نيل' });
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('suppliers/', {
      params: { search: 'نيل', page: 1, page_size: 20 },
    }));
    expect(result.current.page).toBe(1);
  });

  it('صفحة فرغت بعد حذف آخر سجلاتها ترجع إلى السابقة', async () => {
    api.get.mockImplementation((path, { params }) => (params.page === 2
      ? Promise.reject({ response: { status: 404 } })
      : Promise.resolve(page(params.page, 20))));
    const { result } = renderHook(() => usePagedList('users/', { pageSize: 20 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.page).toBe(1));
    await waitFor(() => expect(result.current.items).toEqual([{ id: 1 }]));
    expect(result.current.error).toBeNull();
  });
});
